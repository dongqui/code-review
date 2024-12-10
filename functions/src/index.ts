import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import axios from "axios";
import { PullRequest, PullRequestFile } from "./types";
import OpenAI from "openai";

initializeApp();

const db = getFirestore();

const openai = new OpenAI({
  apiKey: "",
});

export const helloWorld = onRequest(
  {
    region: ["asia-northeast3"],
  },
  async (request, response) => {
    try {
      const pullRequests = await axios.get<PullRequest[]>(
        "https://api.github.com/repos/sprint-9-3/albaform/pulls"
      );

      const pullRequestsURLs = pullRequests.data.map((pr) => [
        pr.number,
        pr.url,
      ]);

      for (const [number, url] of pullRequestsURLs) {
        const res = await axios.get<PullRequestFile[]>(`${url}/files`);
        const files = res.data;

        await db.collection("pullRequests").doc(number.toString()).set({
          number,
          url,
          status: "completed",
        });

        const codeRievewPromises = files
          .filter((file) => file.status !== "removed")
          .filter((file) => {
            const REVIEWABLE_EXTENSIONS = [
              ".js",
              ".jsx",
              ".ts",
              ".tsx",
              ".css",
              ".scss",
              ".sass",
              ".html",
            ];

            const ext = "." + file.filename.split(".").pop()?.toLowerCase();
            return REVIEWABLE_EXTENSIONS.includes(ext);
          })
          .map((file) => file.raw_url)
          .map((codeURL) => reviewCode(codeURL, number.toString()));

        await Promise.allSettled(codeRievewPromises);
      }
    } catch (error) {
      console.log(error);
    }

    response.send("Hello from Firebase!");
  }
);

async function reviewCode(codeURL: string, number: string) {
  const res = await axios.get<string>(codeURL);
  const code = res.data;

  const reviewedCode = await getCodeReviewedByAI(code);

  const result = await db
    .collection("pullRequests")
    .doc(number.toString())
    .collection("reviews")
    .add({
      fileUrl: codeURL,
      reviewedCode: reviewedCode,
    });

  console.log(result);
}

async function getCodeReviewedByAI(code: string) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `
          "Please review shortly the following code. Focus on:"
    "1. Readability: How can the code be improved to be easier to read and understand?"
    "2. Maintainability: Are there any patterns or practices that could make this code easier to maintain in the long run?"
    "3. Performance: Are there any potential bottlenecks or areas where performance could be improved?"
    "4. Security: Are there any security issues or vulnerabilities in this code?"
    "5. Best practices: Does this code follow industry best practices?"`,
      },
      {
        role: "user",
        content: code,
      },
    ],
  });
  return res.choices[0].message.content;
}

const code = `
"use client";

import { useModal } from "@/hooks/useModal";
import Image from "next/image";

const ShareButton = () => {
  const { openModal } = useModal();

  return (
    <button
      className="flex size-[54px] items-center justify-center rounded-full bg-orange-300 shadow-md pc:size-[64px]"
      onClick={() => openModal("ShareSNSModal")}
    >
      <Image src="/icon/link.svg" width={24} height={24} alt="공유하기 버튼" />
    </button>
  );
};

export default ShareButton;`;

getCodeReviewedByAI(code);
