use crate::common::*;
use orchestrion_js::*;

#[test]
fn const_class_export_alias_mjs() {
    transpile_and_test(
        file!(),
        true,
        Config::new_single(InstrumentationConfig::new(
            "Undici:fetch",
            test_module_matcher(),
            FunctionQuery::class_method("Undici", "fetch", FunctionKind::Async).as_export_alias(),
        )),
    );
}
