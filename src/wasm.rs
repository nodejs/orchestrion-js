use crate::{Config, InstrumentationConfig, InstrumentationVisitor, Instrumentor, TransformOutput};
use std::path::PathBuf;
use swc_config::is_module::IsModule;
use wasm_bindgen::prelude::*;

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
/// The type of module being passed - ESM, CJS or unknown
pub enum ModuleType {
    ESM,
    CJS,
    Unknown,
}

impl From<ModuleType> for IsModule {
    fn from(value: ModuleType) -> Self {
        match value {
            ModuleType::ESM => IsModule::Bool(true),
            ModuleType::CJS => IsModule::Bool(false),
            ModuleType::Unknown => IsModule::Unknown,
        }
    }
}

#[wasm_bindgen]
/// The InstrumentationMatcher is responsible for matching specific modules
pub struct InstrumentationMatcher(Instrumentor);

#[wasm_bindgen]
impl InstrumentationMatcher {
    #[wasm_bindgen(js_name = "getTransformer")]
    /// Get a transformer for the given module name, version and file path.
    /// Returns `undefined` if no matching instrumentations are found.
    pub fn get_transformer(
        &mut self,
        module_name: &str,
        version: &str,
        file_path: &str,
    ) -> Option<Transformer> {
        let instrumentations =
            self.0
                .get_matching_instrumentations(module_name, version, &PathBuf::from(file_path));

        if instrumentations.has_instrumentations() {
            Some(Transformer(instrumentations))
        } else {
            None
        }
    }
}

#[wasm_bindgen]
/// The Transformer is responsible for transforming JavaScript code.
pub struct Transformer(InstrumentationVisitor);

#[wasm_bindgen]
impl Transformer {
    /// Transform JavaScript code and optionally sourcemap.
    ///
    /// # Errors
    /// Returns an error if the transformation fails to find injection points.
    #[wasm_bindgen]
    #[allow(clippy::needless_pass_by_value)]
    pub fn transform(
        &mut self,
        code: String,
        module_type: ModuleType,
        sourcemap: Option<String>,
    ) -> Result<TransformOutput, JsError> {
        self.0
            .transform(&code, module_type.into(), sourcemap.as_deref())
            .map_err(|e| JsError::new(&e.to_string()))
    }
}

/// Create a new instrumentation matcher from an array of instrumentation configs.
#[wasm_bindgen]
#[must_use]
pub fn create(
    configs: Vec<InstrumentationConfig>,
    dc_module: Option<String>,
) -> InstrumentationMatcher {
    InstrumentationMatcher(Instrumentor::new(Config::new(configs, dc_module)))
}
