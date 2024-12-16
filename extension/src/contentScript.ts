import getCodeReviews from "./api";
import type { Review } from "./types";
import "./style.css";

// DOM 직접 접근 가능
const $container = document.createElement("div");
$container.classList.add("honey_code_review_container");

const $content = document.createElement("div");
$content.classList.add("honey_code_review_content");

// 토글 버튼 생성
const $toggleButton = document.createElement("button");
$toggleButton.classList.add("toggle_button");
$toggleButton.textContent = "▼"; // 초기 상태는 펼쳐진 상태

// 토글 버튼 클릭 이벤트
$toggleButton.addEventListener("click", () => {
  const isCollapsed = $content.classList.toggle("collapsed");
  $toggleButton.textContent = isCollapsed ? "▲" : "▼";
});

$container.appendChild($content);
$container.appendChild($toggleButton);
document.body.appendChild($container);

const handleChangePullNumber = _handleChangePullNumber();
const handleChangeFile = _handleChangeFile();

const review = {
  list: [] as Review[],
  isLoading: false,
  async fetchList(pullRequestNumber: number) {
    review.isLoading = true;
    review.list = await getCodeReviews(pullRequestNumber);
    review.isLoading = false;

    updateContent();
  },
  getByFileName(targetFileName: string) {
    return review.list.find((r) => {
      const filename = r.review.custom_id.split("/").slice(1).join("/");
      return targetFileName === filename;
    })?.review?.response?.body?.choices[0]?.message?.content;
  },
};

function _handleChangePullNumber() {
  let previousPullNumber = extractPullNumberFromURL();

  return async () => {
    const currentPullNumber = extractPullNumberFromURL();

    if (previousPullNumber !== currentPullNumber) {
      updateReviewList(currentPullNumber);
      previousPullNumber = currentPullNumber;
    }
  };
  // 경로가 실제로 변경되었을 때만 실행
}

function _handleChangeFile() {
  let previousPath = window.location.href;

  return async () => {
    const currentPath = window.location.href;

    if (previousPath !== currentPath) {
      updateContent();

      previousPath = currentPath;
    }
  };
}

async function updateReviewList(currentPullNumber: number | null) {
  if (currentPullNumber !== null) {
    await review.fetchList(currentPullNumber);
  } else {
    review.list = [];
  }
}

function updateContent() {
  const targetFileName = findTargetFileName();
  if (review.isLoading) {
    $content.textContent = "Loading...";
  } else if (review.list.length === 0) {
    $content.textContent = "No reviews";
  } else if (targetFileName) {
    $content.textContent = review.getByFileName(targetFileName) || "No file";
  }
}

function findTargetFileName() {
  const fileElements = document.querySelectorAll(".file");

  for (const element of fileElements) {
    const $ancor = element.querySelector(`[href="${window.location.hash}"]`);
    if ($ancor) {
      return $ancor.textContent;
    }
  }

  return null;
}

function extractPullNumberFromURL() {
  const pullRequestRegex = /\/pull\/(\d+)/;
  const match = window.location.href.match(pullRequestRegex);

  return match ? parseInt(match[1]) : null;
}

function onChangeURL() {
  window.addEventListener("popstate", () => {
    handleChangePullNumber();
    handleChangeFile();
  });
}

function init() {
  const currentPullNumber = extractPullNumberFromURL();
  updateReviewList(currentPullNumber);

  onChangeURL();
}

init();
