use crate::common::*;
use orchestrion_js::*;

#[test]
fn async_generator_decl_mjs() {
    transpile_and_test(
        file!(),
        true,
        Config::new_single(InstrumentationConfig::new(
            "generate_decl",
            test_module_matcher(),
            FunctionQuery::function_declaration("generate", FunctionKind::AsyncGenerator),
        )),
    );
}
