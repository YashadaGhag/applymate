// True when two measured rects describe the same box, so the spotlight keeps its state (and does
// not re-render) when a re-measure finds nothing moved. Either side may be null (not measured yet).
export const sameRect = (a, b) => {
  if (!a || !b) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
};
