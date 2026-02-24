//! # Orchestrion
//! Orchestrion is a library for instrumenting Node.js libraries at build or load time.
//! It provides [`VisitMut`] implementations for SWC's AST nodes, which can be used to insert
//! tracing code into matching functions. It's entirely configurable via a YAML string, and can be
//! used in SWC plugins, or anything else that mutates JavaScript ASTs using SWC.
//!
//! [`VisitMut`]: https://rustdoc.swc.rs/swc_core/ecma/visit/trait.VisitMut.html

#![deny(clippy::all)]
#![deny(clippy::pedantic)]
#![deny(clippy::style)]
#![deny(clippy::perf)]
#![deny(clippy::complexity)]
#![deny(clippy::correctness)]
#![deny(clippy::unwrap_used)]

/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (<https://www.datadoghq.com>/). Copyright 2025 Datadog, Inc.
 **/
use std::{collections::HashMap, error::Error, path::PathBuf, sync::Arc};
use swc::{
    config::{IsModule, SourceMapsConfig},
    sourcemap::SourceMap,
    try_with_handler, Compiler, HandlerOpts, PrintArgs,
};
use swc_core::{
    common::{comments::Comments, errors::ColorConfig, FileName, FilePathMapping},
    ecma::{
        ast::{
            AssignExpr, ClassDecl, ClassExpr, ClassMethod, Constructor, EsVersion, ExportSpecifier,
            FnDecl, MethodProp, Module, ModuleDecl, ModuleExportName, ModuleItem, Script, Str,
            VarDecl,
        },
        visit::{VisitMut, VisitMutWith},
    },
    quote,
};
use swc_ecma_parser::{EsSyntax, Syntax};

mod error;

mod config;
pub use config::*;

mod instrumentation;
pub use instrumentation::*;

mod function_query;
pub use function_query::*;

use crate::error::OrchestrionError;

#[cfg(feature = "wasm")]
pub mod wasm;

/// Output of a transformation operation
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "lowercase")
)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
#[derive(Debug, Clone)]
pub struct TransformOutput {
    /// The transformed JavaScript code
    pub code: String,
    /// The sourcemap for the transformation (if generated)
    pub map: Option<String>,
}

fn module_export_name_to_string(name: &ModuleExportName) -> String {
    match name {
        ModuleExportName::Ident(ident) => ident.sym.to_string(),
        ModuleExportName::Str(s) => s.value.to_string(),
    }
}

/// Collects ESM named export aliases from a module.
/// For `export { local as exported }`, maps `exported -> local`.
/// Skips re-exports from other modules (i.e., `export { x } from 'other'`).
fn collect_export_aliases(module: &Module) -> HashMap<String, String> {
    let mut aliases = HashMap::new();
    for item in &module.body {
        if let ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(named)) = item {
            if named.src.is_some() {
                continue;
            }
            for spec in &named.specifiers {
                if let ExportSpecifier::Named(named_spec) = spec {
                    if let Some(exported) = &named_spec.exported {
                        let exported_name = module_export_name_to_string(exported);
                        let local_name = module_export_name_to_string(&named_spec.orig);
                        aliases.insert(exported_name, local_name);
                    }
                }
            }
        }
    }
    aliases
}

/// This struct is responsible for managing all instrumentations. It's created from a YAML string
/// via the [`FromStr`] trait. See tests for examples, but by-and-large this just means you can
/// call `.parse()` on a YAML string to get an `Instrumentor` instance, if it's valid.
///
/// [`FromStr`]: https://doc.rust-lang.org/std/str/trait.FromStr.html
pub struct Instrumentor {
    instrumentations: Vec<Instrumentation>,
    dc_module: String,
}

impl Instrumentor {
    #[must_use]
    pub fn new(config: Config) -> Self {
        Self {
            instrumentations: config
                .instrumentations
                .into_iter()
                .map(Instrumentation::new)
                .collect(),
            dc_module: config.dc_module,
        }
    }

    /// For a given module name, version, and file path within the module, return all
    /// `Instrumentation` instances that match.
    #[must_use]
    pub fn get_matching_instrumentations(
        &self,
        module_name: &str,
        version: &str,
        file_path: &PathBuf,
    ) -> InstrumentationVisitor {
        let instrumentations = self
            .instrumentations
            .iter()
            .filter(|instr| instr.matches(module_name, version, file_path))
            .cloned()
            .map(|mut i| {
                i.set_module_version(version);
                i
            });

        InstrumentationVisitor::new(instrumentations, &self.dc_module)
    }
}

#[derive(Debug)]
pub struct InstrumentationVisitor {
    instrumentations: Vec<Instrumentation>,
    dc_module: String,
}

impl InstrumentationVisitor {
    fn new<I>(instrumentations: I, dc_module: &str) -> Self
    where
        I: Iterator<Item = Instrumentation>,
    {
        Self {
            instrumentations: instrumentations.collect(),
            dc_module: dc_module.to_string(),
        }
    }

    #[must_use]
    pub fn has_instrumentations(&self) -> bool {
        !self.instrumentations.is_empty()
    }

    #[must_use]
    pub fn get_failed_injections(&self) -> Option<Vec<String>> {
        let failed: Vec<String> = self
            .instrumentations
            .iter()
            .filter_map(|instr| {
                if instr.has_injected() {
                    None
                } else {
                    Some(instr.query_display_name())
                }
            })
            .collect();

        if failed.is_empty() {
            None
        } else {
            Some(failed)
        }
    }

    pub fn reset_has_injected(&mut self) {
        for instr in &mut self.instrumentations {
            instr.reset_has_injected();
        }
    }

    /// Transform the given JavaScript code with sourcemap support.
    /// # Errors
    /// Returns an error if the transformation fails.
    pub fn transform(
        &mut self,
        contents: &str,
        is_module: IsModule,
        sourcemap: Option<&str>,
    ) -> Result<TransformOutput, Box<dyn Error>> {
        let compiler = Compiler::new(Arc::new(swc_core::common::SourceMap::new(
            FilePathMapping::empty(),
        )));

        // Parse input sourcemap if provided
        let sourcemap =
            sourcemap.and_then(|input_map| SourceMap::from_slice(input_map.as_bytes()).ok());

        let filename = sourcemap
            .as_ref()
            .and_then(|map| map.get_file().map(ToString::to_string));

        #[allow(clippy::redundant_closure_for_method_calls)]
        let result = try_with_handler(
            compiler.cm.clone(),
            HandlerOpts {
                color: ColorConfig::Never,
                skip_filename: false,
            },
            |handler| {
                let source_filename = filename.as_ref().map_or_else(
                    || Arc::new(FileName::Real(PathBuf::from("index.js"))),
                    |f| Arc::new(FileName::Real(PathBuf::from(f))),
                );

                let source_file = compiler
                    .cm
                    .new_source_file(source_filename, contents.to_string());

                let program = compiler
                    .parse_js(
                        source_file.clone(),
                        handler,
                        EsVersion::latest(),
                        Syntax::Es(EsSyntax {
                            explicit_resource_management: true,
                            import_attributes: true,
                            decorators: true,
                            ..Default::default()
                        }),
                        is_module,
                        Some(&compiler.comments() as &dyn Comments),
                    )
                    .map(|mut program| {
                        program.visit_mut_with(self);
                        program
                    })?;

                let enable_sourcemap = sourcemap.is_some();
                let result = compiler.print(
                    &program,
                    PrintArgs {
                        source_file_name: filename.as_deref(),
                        source_map: SourceMapsConfig::Bool(enable_sourcemap),
                        comments: None,
                        emit_source_map_columns: true,
                        orig: sourcemap,
                        ..Default::default()
                    },
                )?;

                Ok(TransformOutput {
                    code: result.code,
                    map: result.map,
                })
            },
        )
        .map_err(|e| e.to_pretty_error())?;

        let failed_injections = self.get_failed_injections();
        self.reset_has_injected();

        if let Some(failed) = failed_injections {
            Err(Box::new(OrchestrionError::InjectionMatchFailure(failed)))
        } else {
            Ok(result)
        }
    }
}

macro_rules! visit_with_all {
    ($self:expr, $method:ident, $item:expr) => {
        let mut recurse = false;
        for instr in &mut $self.instrumentations {
            let needs_recurse = instr.$method($item);
            recurse = recurse || needs_recurse;
        }
        if recurse {
            $item.visit_mut_children_with($self);
        }
    };
}

macro_rules! visit_with_all_fn {
    ($method:ident, $item_struct:ty) => {
        fn $method(&mut self, item: &mut $item_struct) {
            visit_with_all!(self, $method, item);
        }
    };
}

impl VisitMut for InstrumentationVisitor {
    fn visit_mut_module(&mut self, item: &mut Module) {
        let aliases = collect_export_aliases(item);
        if !aliases.is_empty() {
            for instr in &mut self.instrumentations {
                instr.resolve_export_aliases(&aliases);
            }
        }

        let mut line = quote!(
            "import { tracingChannel as tr_ch_apm_tracingChannel } from 'dc';" as ModuleItem,
        );
        if let Some(module_decl) = line.as_mut_module_decl() {
            if let Some(import) = module_decl.as_mut_import() {
                import.src = Box::new(Str::from(self.dc_module.as_ref()));
                item.body.insert(0, line);
            }
        }
        visit_with_all!(self, visit_mut_module, item);
        for instr in &mut self.instrumentations {
            instr.reset();
        }
    }

    fn visit_mut_script(&mut self, item: &mut Script) {
        let import = quote!(
            "const { tracingChannel: tr_ch_apm_tracingChannel } = require($dc);" as Stmt,
            dc: Expr = self.dc_module.clone().into(),
        );
        item.body.insert(get_script_start_index(item), import);
        visit_with_all!(self, visit_mut_script, item);
        for instr in &mut self.instrumentations {
            instr.reset();
        }
    }

    visit_with_all_fn!(visit_mut_fn_decl, FnDecl);
    visit_with_all_fn!(visit_mut_var_decl, VarDecl);
    visit_with_all_fn!(visit_mut_method_prop, MethodProp);
    visit_with_all_fn!(visit_mut_assign_expr, AssignExpr);
    visit_with_all_fn!(visit_mut_class_decl, ClassDecl);
    visit_with_all_fn!(visit_mut_class_expr, ClassExpr);
    visit_with_all_fn!(visit_mut_class_method, ClassMethod);
    visit_with_all_fn!(visit_mut_constructor, Constructor);
}
