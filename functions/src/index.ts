import * as dotenv from "dotenv";
import {resolve} from "path";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import axios from "axios";
import OpenAI from "openai";

import {PullRequest, PullRequestFile, OpenAIBatch} from "./types";

dotenv.config({path: resolve(__dirname, "../.env")});

initializeApp();
const db = getFirestore();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const helloWorld = onSchedule(
  {
    schedule: "20 * * * *",
  },
  async () => {
    try {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const pullRequestsResponse = await axios.get<PullRequest[]>(
        "https://api.github.com/repos/sprint-9-3/albaform/pulls"
      );
      const reeviewedPullRequestsDocs = await db.collection("pullRequests")
        .where("codeReviewBatchFromGPT", "!=", null)
        .where("createdAt", ">=", twoWeeksAgo)
        .get();

      const reviewedPullRequestsNumbers = reeviewedPullRequestsDocs.docs.map((doc) => doc.data().number);
      const pullRequestsToReivew = pullRequestsResponse.data.filter((pr) => !(reviewedPullRequestsNumbers.includes(pr.number)));

      for (const {number, url, html_url} of pullRequestsToReivew) {
        const res = await axios.get<PullRequestFile[]>(`${url}/files`);
        const files = res.data;


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
          .map((file) => [file.raw_url, `${number}/${file.filename}`])
          .map(([codeURL, filename]) => createBatch(codeURL, filename));

        const batches = await Promise.all(codeRievewPromises);
        const jsonlString = batches.map((batch) => JSON.stringify(batch)).join("\n");


        const codeReviewBatchFromGPT = await uploadBatch(jsonlString);

        await db.collection("pullRequests").doc(number.toString()).set({
          number,
          url,
          htmlUrl: html_url,
          hasReviews: false,
          codeReviewBatchFromGPT,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (error) {
      console.log(error);
    }
  }
);

async function createBatch(codeURL: string, filename: string) {
  const res = await axios.get<string>(codeURL);
  const code = res.data;
  return batchFactory(filename, code);
}

function batchFactory(filename: string, code: string) {
  return {
    custom_id: filename,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: "gpt-3.5-turbo",
      messages: [
        {role: "system", content: `
          "Please review shortly the following code. Focus on:"
      "1. Readability: How can the code be improved to be easier to read and understand?"
    "2. Maintainability: Are there any patterns or practices that could make this code easier to maintain in the long run?"
    "3. Performance: Are there any potential bottlenecks or areas where performance could be improved?"
    "4. Security: Are there any security issues or vulnerabilities in this code?"
    "5. Best practices: Does this code follow industry best practices?"`},

        {
          role: "user",
          content: code,
        },
      ],
    },
  };
}

async function uploadBatch(jsonlString: string) {
  const blob = new Blob([jsonlString], {type: "application/jsonl"});
  const file = new File([blob], "batch.jsonl", {type: "application/jsonl", lastModified: Date.now()});


  const batchFileUploadOutput = await openai.files.create({
    file,
    purpose: "batch",
  });

  const batch = await openai.batches.create({
    input_file_id: batchFileUploadOutput.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
  });

  return batch;
}


export const getReviewsScheduler = onSchedule(
  {
    schedule: "25 * * * *",
  },
  async () => {
    const unReviewedPullRequestDocs = await db.collection("pullRequests").where("hasReviews", "==", false).get();
    for (const doc of unReviewedPullRequestDocs.docs) {
      const pullRequest = doc.data();
      const batch: OpenAIBatch = pullRequest.codeReviewBatchFromGPT;

      const updatedBatch = await openai.batches.retrieve(batch.id);
      if (updatedBatch?.status === "completed" && updatedBatch.output_file_id) {
        const content = await openai.files.content(updatedBatch.output_file_id);
        const buffer = Buffer.from(await content.arrayBuffer());
        const jsonl = buffer.toString("utf-8");
        const reviews = jsonl.split("\n").filter((line) => !!line).map((line) => JSON.parse(line));

        const dbBatch = db.batch();
        reviews.forEach((review) => dbBatch.create(db.collection("reviews").doc(), {
          pullRequestNumber: pullRequest.number,
          review,
        }));

        dbBatch.update(db.collection("pullRequests").doc(pullRequest.number.toString()), ({
          hasReviews: true,
          codeReviewBatchFromGPT: updatedBatch,
        }));

        await dbBatch.commit();
      }
    }
  }
);


