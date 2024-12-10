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

      for (const { number, url, html_url } of pullRequests.data) {
        const res = await axios.get<PullRequestFile[]>(`${url}/files`);
        const files = res.data;

        await db.collection("pullRequests").doc(number.toString()).set({
          number,
          url,
          htmlUrl: html_url,
        });

        const codeRievewPromises = files
          .filter((file) => file.status !== "removed")
          .filter((file) => {
            const REVIEWABLE_EXTENSIONS = [
              "js",
              "jsx",
              "ts",
              "tsx",
              "css",
              "scss",
              "sass",
              "html",
            ];

            const ext = file.filename.split(".").pop()?.toLowerCase();
            return REVIEWABLE_EXTENSIONS.includes(ext ?? "");
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

  await db
    .collection("pullRequests")
    .doc(number.toString())
    .collection("reviews")
    .add({
      fileUrl: codeURL,
      reviewedCode: reviewedCode,
    });
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
