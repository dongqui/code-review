import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import styled from "@emotion/styled";

import useReviews from "./hooks/useReviews";

const Container = styled.div`
  width: 300px;
  padding: 20px;
`;

const Title = styled.h1`
  font-size: 18px;
  margin-bottom: 10px;
`;

const Popup = () => {
  const { reviews, isLoading, error } = useReviews(225);

  useEffect(() => {
    if (chrome?.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab.id) {
          chrome.tabs.sendMessage(
            activeTab.id,
            { type: "GET_PAGE_CONTENT" },
            (response) => {
              console.log("페이지 컨텐츠:", response.content);
            }
          );
        }
      });
    }
  }, []);

  return (
    <Container>
      <Title>PR Code Review Assistant</Title>
      <p>Your PR review helper is ready!</p>
      asd
    </Container>
  );
};

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}
