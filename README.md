# Swill

A weird Cocoa-inspired highly object-oriented library that likely "seems bad."

You can see the [brewery demo app on heroku.](https://secret-escarpment-65845-6e3cf8eddee5.herokuapp.com/) I still use and appreciate Heroku.

Current version: see `VERSION`. This is not an npm package.

## Usage

1. clone this
2. open `./examples/static/static.html` to use pre-built swill.
3. run `./dev.sh`
5. navigate to `localhost:3000/examples/breweries/breweries.html`

The other examples probably won't work for you. 

### Dependencies

* `esbuild` is required. you can brew install it or whatever
* You need python3 to run the python proxy server.
* `tsc` is useful for typechecking.

## Interesting...

I don't enjoy Javascript at all anymore, and this project might be evidence of that.
I also don't enjoy passing HTML fragments around, because I've tried that and its confusing.
Nor do I want my side projects to smell, taste or have a hint of anything React.
There will be no NPM packages, no dependencies. There will be files and objects.
And, there will be things on String that String should have. 

Why am I not using Ember? I used to like Ember but it has CLI tools, releases, VMs, etc.
Again, I'm looking for files and objects.

Performance you ask?! Yes, Swill performs -- with majesty.

Maybe I should try Pheonix LiveView? Maybe.
But I'm going to continue writing Ruby without Rails things.

I regret using Typescript for this, there's so much mumbo jumbo in Typescript.
The active experiment is now an [Opal port](opal/README.md). Its framework
kernel is working and tested, while its model and client/server layers are still
under development.

### But there's been so much progress since the mid 2010s!?!

And yet, you still cant camelize a string in JavaScript. 

### "This is bad, but at least you vibe-coded it, so it's not really your fault."

IT IS my fault. I would like to take credit for many the decisions you object to; 
but you should credit the agents for the code they wrote. 

## Usage

Put a script tag in your layout that loads the framework.
Write markup on pages and load them from a server.
Load other things on the side if you want.

## Stuff

### Bindings
### Computed Properties
### The Responder Chain

## Framework Docs

These documents describe the TypeScript implementation. See the
[Opal README](opal/README.md) for the Opal implementation's current surface,
setup, checks, and remaining work.

- [Awakening, Hydration, and Templates](docs/awakening.md)
- [Bindings](docs/bindings.md)
- [Lifecycle](docs/lifecycle.md)
- [Models and Relationships](docs/models.md)
