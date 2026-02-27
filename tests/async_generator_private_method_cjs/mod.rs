use crate::common::*;
use orchestrion_js::*;

#[test]
fn async_generator_private_method_cjs() {
    transpile_and_test(
        file!(),
        false,
        Config::new_single(InstrumentationConfig::new(
            "Streamer:generate",
            test_module_matcher(),
            FunctionQuery::private_method("Streamer", "generate", FunctionKind::AsyncGenerator),
        )),
    );
}
