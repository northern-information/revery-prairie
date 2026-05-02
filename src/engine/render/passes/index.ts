// Pass barrel. Importing this module triggers registration of every pass
// in the render pipeline (each pass module calls registerPass at the top
// level). renderer.ts imports this once so all passes are available before
// the first render() call.

export { tileBgCompositePass } from './tileBgComposite'
