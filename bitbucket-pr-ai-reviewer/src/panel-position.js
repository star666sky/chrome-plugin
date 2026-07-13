(function exposePanelPosition(globalScope) {
  function clampDockedPosition(position, height, viewportHeight, margin) {
    const safeMargin = Number.isFinite(margin) ? margin : 16;
    const maxTop = Math.max(safeMargin, viewportHeight - height - safeMargin);
    const rawTop = Number.isFinite(position?.top) ? position.top : Math.round(viewportHeight * 0.4);

    return {
      top: Math.min(Math.max(safeMargin, Math.round(rawTop)), maxTop)
    };
  }

  function getDefaultDockedPosition(viewportHeight, height, margin) {
    return clampDockedPosition({ top: Math.round(viewportHeight * 0.4) }, height, viewportHeight, margin);
  }

  function createDockedStyle(position) {
    return {
      left: "auto",
      right: "0px",
      top: `${position.top}px`
    };
  }

  const api = {
    clampDockedPosition,
    createDockedStyle,
    getDefaultDockedPosition
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.BitbucketPrAiReviewerPosition = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
