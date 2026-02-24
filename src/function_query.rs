/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (<https://www.datadoghq.com>/). Copyright 2025 Datadog, Inc.
 **/
use std::collections::HashMap;
use swc_core::ecma::ast::FnDecl;

#[derive(Debug, Clone)]
pub(crate) enum FunctionType {
    FunctionDeclaration,
    FunctionExpression,
    Method,
}

/// The kind of function - Sync or returns a promise
#[cfg_attr(feature = "wasm", derive(tsify::Tsify))]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Clone)]
pub enum FunctionKind {
    Sync,
    Async,
}

impl FunctionKind {
    #[must_use]
    pub fn is_async(&self) -> bool {
        matches!(self, FunctionKind::Async)
    }

    #[must_use]
    pub fn tracing_operator(&self) -> &'static str {
        match self {
            FunctionKind::Sync => "traceSync",
            FunctionKind::Async => "tracePromise",
        }
    }
}

#[cfg_attr(feature = "wasm", derive(tsify::Tsify))]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(untagged, rename_all_fields = "camelCase")
)]
/// Describes which function to instrument
#[derive(Debug, Clone)]
pub enum FunctionQuery {
    // The order here matters because this enum is untagged, serde will try
    // choose the first variant that matches the data.
    ClassMethod {
        class_name: String,
        method_name: String,
        kind: FunctionKind,
        #[cfg_attr(feature = "serde", serde(default))]
        #[cfg_attr(feature = "wasm", tsify(optional))]
        index: usize,
        #[cfg_attr(feature = "serde", serde(default))]
        #[cfg_attr(feature = "wasm", tsify(optional))]
        is_export_alias: bool,
    },
    ClassConstructor {
        class_name: String,
        #[cfg_attr(feature = "serde", serde(default))]
        #[cfg_attr(feature = "wasm", tsify(optional))]
        index: usize,
        #[cfg_attr(feature = "serde", serde(default))]
        #[cfg_attr(feature = "wasm", tsify(optional))]
        is_export_alias: bool,
    },
    ObjectMethod {
        method_name: String,
        kind: FunctionKind,
        #[cfg_attr(feature = "serde", serde(default))]
        #[cfg_attr(feature = "wasm", tsify(optional))]
        index: usize,
    },
    FunctionDeclaration {
        function_name: String,
        kind: FunctionKind,
        #[cfg_attr(feature = "serde", serde(default))]
        #[cfg_attr(feature = "wasm", tsify(optional))]
        index: usize,
        #[cfg_attr(feature = "serde", serde(default))]
        #[cfg_attr(feature = "wasm", tsify(optional))]
        is_export_alias: bool,
    },
    FunctionExpression {
        expression_name: String,
        kind: FunctionKind,
        #[cfg_attr(feature = "serde", serde(default))]
        #[cfg_attr(feature = "wasm", tsify(optional))]
        index: usize,
        #[cfg_attr(feature = "serde", serde(default))]
        #[cfg_attr(feature = "wasm", tsify(optional))]
        is_export_alias: bool,
    },
}

impl FunctionQuery {
    #[must_use]
    pub fn class_constructor(class_name: &str) -> Self {
        FunctionQuery::ClassConstructor {
            class_name: class_name.to_string(),
            index: 0,
            is_export_alias: false,
        }
    }

    #[must_use]
    pub fn class_method(class_name: &str, method_name: &str, kind: FunctionKind) -> Self {
        FunctionQuery::ClassMethod {
            class_name: class_name.to_string(),
            method_name: method_name.to_string(),
            kind,
            index: 0,
            is_export_alias: false,
        }
    }

    #[must_use]
    pub fn object_method(method_name: &str, kind: FunctionKind) -> Self {
        FunctionQuery::ObjectMethod {
            method_name: method_name.to_string(),
            kind,
            index: 0,
        }
    }

    #[must_use]
    pub fn function_declaration(function_name: &str, kind: FunctionKind) -> Self {
        FunctionQuery::FunctionDeclaration {
            function_name: function_name.to_string(),
            kind,
            index: 0,
            is_export_alias: false,
        }
    }

    #[must_use]
    pub fn function_expression(expression_name: &str, kind: FunctionKind) -> Self {
        FunctionQuery::FunctionExpression {
            expression_name: expression_name.to_string(),
            kind,
            index: 0,
            is_export_alias: false,
        }
    }

    #[must_use]
    pub fn as_export_alias(mut self) -> Self {
        match &mut self {
            FunctionQuery::ClassConstructor {
                is_export_alias, ..
            }
            | FunctionQuery::ClassMethod {
                is_export_alias, ..
            }
            | FunctionQuery::FunctionDeclaration {
                is_export_alias, ..
            }
            | FunctionQuery::FunctionExpression {
                is_export_alias, ..
            } => *is_export_alias = true,
            FunctionQuery::ObjectMethod { .. } => {}
        }
        self
    }

    pub(crate) fn kind(&self) -> &FunctionKind {
        match self {
            FunctionQuery::ClassConstructor { .. } => &FunctionKind::Sync,
            FunctionQuery::ClassMethod { kind, .. }
            | FunctionQuery::ObjectMethod { kind, .. }
            | FunctionQuery::FunctionDeclaration { kind, .. }
            | FunctionQuery::FunctionExpression { kind, .. } => kind,
        }
    }

    pub(crate) fn name(&self) -> &str {
        match self {
            FunctionQuery::ClassConstructor { .. } => "constructor",
            FunctionQuery::ClassMethod { method_name, .. }
            | FunctionQuery::ObjectMethod { method_name, .. } => method_name,
            FunctionQuery::FunctionDeclaration { function_name, .. } => function_name,
            FunctionQuery::FunctionExpression {
                expression_name, ..
            } => expression_name,
        }
    }

    pub(crate) fn typ(&self) -> FunctionType {
        match self {
            FunctionQuery::ClassConstructor { .. }
            | FunctionQuery::ClassMethod { .. }
            | FunctionQuery::ObjectMethod { .. } => FunctionType::Method,
            FunctionQuery::FunctionDeclaration { .. } => FunctionType::FunctionDeclaration,
            FunctionQuery::FunctionExpression { .. } => FunctionType::FunctionExpression,
        }
    }

    #[must_use]
    pub(crate) fn index(&self) -> usize {
        match self {
            FunctionQuery::ClassConstructor { index, .. }
            | FunctionQuery::ClassMethod { index, .. }
            | FunctionQuery::ObjectMethod { index, .. }
            | FunctionQuery::FunctionDeclaration { index, .. }
            | FunctionQuery::FunctionExpression { index, .. } => *index,
        }
    }

    #[must_use]
    pub(crate) fn class_name(&self) -> Option<&str> {
        match self {
            FunctionQuery::ClassConstructor { class_name, .. }
            | FunctionQuery::ClassMethod { class_name, .. } => Some(class_name),
            _ => None,
        }
    }

    fn resolvable_name_mut(&mut self) -> Option<(&mut String, bool)> {
        match self {
            FunctionQuery::ClassConstructor {
                class_name,
                is_export_alias,
                ..
            }
            | FunctionQuery::ClassMethod {
                class_name,
                is_export_alias,
                ..
            } => Some((class_name, *is_export_alias)),
            FunctionQuery::FunctionDeclaration {
                function_name,
                is_export_alias,
                ..
            } => Some((function_name, *is_export_alias)),
            FunctionQuery::FunctionExpression {
                expression_name,
                is_export_alias,
                ..
            } => Some((expression_name, *is_export_alias)),
            FunctionQuery::ObjectMethod { .. } => None,
        }
    }

    pub(crate) fn resolve_export_alias(&mut self, aliases: &HashMap<String, String>) {
        if let Some((name, true)) = self.resolvable_name_mut() {
            if let Some(local) = aliases.get(name.as_str()) {
                name.clone_from(local);
            }
        }
    }

    fn maybe_increment_count(&self, matches_except_count: bool, count: &mut usize) -> bool {
        if matches_except_count {
            if self.index() == *count {
                true
            } else {
                *count += 1;
                false
            }
        } else {
            false
        }
    }

    pub fn matches_decl(&self, func: &FnDecl, count: &mut usize) -> bool {
        let matches_except_count = matches!(self.typ(), FunctionType::FunctionDeclaration)
            && func.ident.sym == self.name();
        self.maybe_increment_count(matches_except_count, count)
    }

    pub fn matches_expr(&self, count: &mut usize, name: &str) -> bool {
        let matches_except_count =
            matches!(self.typ(), FunctionType::FunctionExpression) && name == self.name();
        self.maybe_increment_count(matches_except_count, count)
    }

    pub fn matches_method(&self, count: &mut usize, name: &str) -> bool {
        let matches_except_count =
            matches!(self.typ(), FunctionType::Method) && name == self.name();
        self.maybe_increment_count(matches_except_count, count)
    }
}
