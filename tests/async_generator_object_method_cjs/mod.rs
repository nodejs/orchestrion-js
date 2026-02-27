use crate::common::*;
use orchestrion_js::*;

#[test]
fn async_generator_object_method_cjs() {
    transpile_and_test(
        file!(),
        false,
        Config::new_single(InstrumentationConfig::new(
            "streamer_generate",
            test_module_matcher(),
            FunctionQuery::object_method("generate", FunctionKind::AsyncGenerator),
        )),
    );
}
