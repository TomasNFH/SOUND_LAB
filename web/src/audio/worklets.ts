// A worklet module has to be added to every context that uses it: the live
// one and each offline export context. This loads each module once per
// context.
const loaded = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

export function loadWorklet(ctx: BaseAudioContext, url: string) {
  let modules = loaded.get(ctx);
  if (!modules) {
    modules = new Map();
    loaded.set(ctx, modules);
  }
  let p = modules.get(url);
  if (!p) {
    p = ctx.audioWorklet.addModule(url);
    modules.set(url, p);
  }
  return p;
}
