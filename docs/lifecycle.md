# Lifecycle

Swill has one activation path for code-created views and awakened DOM. `View.addSubview(child)` and the document awakening walk both call the same activation runner.

## Activation Order

For a controller-backed view, the load phase runs:

1. `constructor`
2. attribute mappings
3. `viewDidLoad()`
4. connect outlets
5. wire bindings
6. `awakeFromDOM()`

For controllers in a window, window configuration then runs:

1. URL/window restoration values are applied through `restorationBindings()`
2. `controllerDidRestore({ restored })` runs on the top controller if it declares restoration bindings
3. `controllerDidLoad()` runs once for every controller in the window

The appearance phase then runs:

1. `viewWillAppear()`
2. `viewDidAppear()`

Code-created views and awakened DOM outside window restoration use the same runner with no restoration step:

1. load phase
2. `controllerDidLoad()`
3. appearance phase

`viewDidLoad()` is the place for object setup that does not depend on outlets or bindings.

`awakeFromDOM()` is the place for work that needs connected outlets, wired child controllers, or decoded JSON outlets.

`controllerDidRestore()` is the restoration-specific hook. `restored` is true when at least one fragment value was applied.

`controllerDidLoad()` is the general post-configuration hook. Use it for initial work that depends on defaults, DOM configuration, and any restored values all being in place. It is called once for each controller instance.

`viewWillAppear()` and `viewDidAppear()` are appearance hooks. Loading is once per view. Appearance can happen again after explicit detach and reattach.

## Teardown

Teardown is controller-owned and direct-owner only. Callers should ask the owning controller or application to remove a region instead of reaching through unrelated elements.

The framework teardown path runs:

1. `viewWillDisappear()`
2. controller disposers for bindings, actions, and internal listeners
3. descendant controller teardown
4. optional DOM removal
5. `viewDidDisappear()`

`View.removeFromSuperview()` is only the low-level structural primitive. It unlinks and removes the element. Controller removal should go through the framework teardown path so observers and listeners are disposed.

## Direct Ownership

Elements should only be managed by their direct owners:

- A controller owns its root view and its declared outlets.
- A view owns its sparse subviews.
- A list owns its row region and row views.
- The application owns windows and document-level routing.

Parent controllers should communicate through child controller public API, bindings, outlets, or responder actions. They should not mutate arbitrary descendant DOM.

## Focus and Actions

Programmatic focus changes use `makeFirstResponder`.

Actions resolve from the sender's first responder with `firstResponderFor(sender)`, then walk the responder chain. This follows Cocoa target/action shape without making DOM nearness an API concept.
