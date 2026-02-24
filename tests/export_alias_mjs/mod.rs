use crate::common::*;
use orchestrion_js::*;

#[test]
fn export_alias_mjs() {
    transpile_and_test(
        file!(),
        true,
        Config::new_single(InstrumentationConfig::new(
            "fetch_alias",
            test_module_matcher(),
            FunctionQuery::function_declaration("fetchAliased", FunctionKind::Async)
                .as_export_alias(),
        )),
    );
}
