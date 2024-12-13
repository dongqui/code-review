// DOM 직접 접근 가능
document.querySelector(".some-class");

// popup.tsx와 통신하기 위한 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTENT") {
    const content = document.querySelector(".specific-element")?.textContent;
    sendResponse({ content });
  }
});
