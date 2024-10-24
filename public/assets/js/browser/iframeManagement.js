const originalOpen = window.open;
window.open = function(url, name, features) {
  onWindowOpen(url, name, features);
  return originalOpen.apply(this, arguments);
};

const originalClose = window.close;
window.close = function() {
  onWindowClose();
  return originalClose.apply(this, arguments);
};

function onWindowOpen(url, name, features) {
  console.log("Window opened:", url, name, features);
  parent.document.tabs.createTab(url); 
}

function onWindowClose() {
  console.log("Window closed");
}