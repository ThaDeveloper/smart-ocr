declare module "@napi-rs/canvas/js-binding.js" {
  const binding: {
    CanvasElement: new (width: number, height: number) => import("@napi-rs/canvas").Canvas;
  };

  export default binding;
}
