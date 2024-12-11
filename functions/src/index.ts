import * as dotenv from "dotenv";
import {resolve} from "path";
import {onRequest} from "firebase-functions/v2/https";
import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import axios from "axios";
import {PullRequest, PullRequestFile, OpenAIFile, OpenAIBatch} from "./types";

dotenv.config({path: resolve(__dirname, "../.env")});

initializeApp();

const db = getFirestore();


export const helloWorld = onRequest(
  {
    region: ["asia-northeast3"],
  },
  async (request, response) => {
    try {
      const pullRequests = await axios.get<PullRequest[]>(
        "https://api.github.com/repos/sprint-9-3/albaform/pulls"
      );

      for (const {number, url, html_url} of pullRequests.data) {
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

        await uploadBatchFile(jsonlString);

        await db.collection("pullRequests").doc(number.toString()).set({
          number,
          url,
          htmlUrl: html_url,
        });
      }
    } catch (error) {
      console.log(error);
    }

    response.send("Hello from Firebase!");
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

async function uploadBatchFile(jsonlString: string) {
  const blob = new Blob([jsonlString], {type: "application/jsonl"});

  const formData = new FormData();
  formData.append("purpose", "batch");
  formData.append("file", blob);

  const batchFileUploadResponse = await axios.post<OpenAIFile>(
    "https://api.openai.com/v1/files",
    formData,
    {
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "multipart/form-data",
      },
    }
  );
  const batchFileUploadOutput = batchFileUploadResponse.data;

  const batchOutputResponse = await axios.post<OpenAIBatch>("https://api.openai.com/v1/batches", {
    "input_file_id": batchFileUploadOutput.id,
    "endpoint": "/v1/chat/completions",
    "completion_window": "24h",
  }, {
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  return batchOutputResponse.data;
}
