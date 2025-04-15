(function () {
  const originalWindowOpen = window.open;

  window.open = async function () {};
})();
