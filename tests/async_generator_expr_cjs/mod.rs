use crate::common::*;
use orchestrion_js::*;

#[test]
fn async_generator_expr_cjs() {
    transpile_and_test(
        file!(),
        false,
        Config::new_single(InstrumentationConfig::new(
            "generate_expr",
            test_module_matcher(),
            FunctionQuery::function_expression("generate", FunctionKind::AsyncGenerator),
        )),
    );
}
