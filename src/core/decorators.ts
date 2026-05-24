// Decorators facade. Keep the authoring surface in one import while the
// implementations live near their own concerns.

export { register, outlet, outletNamesOf, isOptionalOutlet } from "./awakening/decorators";
export { observable, computed, binding, type BindingAdapter } from "./bindings/decorators";
