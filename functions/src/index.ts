import * as dotenv from "dotenv";
import { resolve } from "path";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import axios from "axios";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { PullRequest, PullRequestFile, OpenAIBatch } from "./types";

dotenv.config({ path: resolve(__dirname, "../.env") });

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
        "https://api.github.com/repos/codeit-bootcamp-frontend/14-Sprint-Mission/pulls"
      );

      const reeviewedPullRequestsDocs = await db
        .collection("pullRequests")
        .where("codeReviewBatchFromGPT", "!=", null)
        .where("createdAt", ">=", twoWeeksAgo)
        .get();

      const reviewedPullRequestsNumbers = reeviewedPullRequestsDocs.docs.map(
        (doc) => doc.data().number
      );

      const pullRequestsToReivew = pullRequestsResponse.data.filter(
        (pr) => !reviewedPullRequestsNumbers.includes(pr.number)
      );

      for (const { number, url, html_url } of pullRequestsToReivew) {
        const res = await axios.get<PullRequestFile[]>(`${url}/files`);
        const files = res.data;

        const codeRievewBatches = files
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
          .filter((file) => file.patch)
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          .map((file) => [`${number}/${file.filename}`, file.patch!])
          .map(([filename, patchCode]) => createBatch(filename, patchCode));

        const jsonlString = codeRievewBatches
          .map((batch) => JSON.stringify(batch))
          .join("\n");

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

function formattingPatchCode(code: string) {
  return code
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.substring(1))
    .filter((line) => !!line)
    .join();
}

function createBatch(filename: string, patchCode: string) {
  const addedCode = formattingPatchCode(patchCode);
  return batchFactory(filename, addedCode);
}

function batchFactory(filename: string, code: string) {
  return {
    custom_id: filename,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
            웹 접근성, 웹 표준, 가독성, 성능, 보안을 중점으로 코드 리뷰 해줘. 간결하게 해.
          `,
        },

        {
          role: "user",
          content: code,
        },
      ],
    },
  };
}

async function uploadBatch(jsonlString: string) {
  const tempPath = path.join(os.tmpdir(), "batch.jsonl");
  fs.writeFileSync(tempPath, jsonlString);
  const file = fs.createReadStream(tempPath);

  const batchFileUploadOutput = await openai.files.create({
    file,
    purpose: "batch",
  });

  fs.unlinkSync(tempPath); // 임시 파일 삭제

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
    try {
      const unReviewedPullRequestDocs = await db
        .collection("pullRequests")
        .where("hasReviews", "==", false)
        .get();
      for (const doc of unReviewedPullRequestDocs.docs) {
        const pullRequest = doc.data();
        const batch: OpenAIBatch = pullRequest.codeReviewBatchFromGPT;

        const updatedBatch = await openai.batches.retrieve(batch.id);
        if (
          updatedBatch?.status === "completed" &&
          updatedBatch.output_file_id
        ) {
          const content = await openai.files.content(
            updatedBatch.output_file_id
          );
          const buffer = Buffer.from(await content.arrayBuffer());
          const jsonl = buffer.toString("utf-8");
          const reviews = jsonl
            .split("\n")
            .filter((line) => !!line)
            .map((line) => JSON.parse(line));

          const dbBatch = db.batch();
          reviews.forEach((review) =>
            dbBatch.create(db.collection("reviews").doc(), {
              pullRequestNumber: pullRequest.number,
              review,
            })
          );

          dbBatch.update(
            db.collection("pullRequests").doc(pullRequest.number.toString()),
            {
              hasReviews: true,
              codeReviewBatchFromGPT: updatedBatch,
            }
          );

          await dbBatch.commit();
        }
      }
    } catch (e) {
      console.log(e, "@@@@@@@@@@@@@@@@@@@@@@@@@@@");
    }
  }
);
