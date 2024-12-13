import { db } from "./db";
import { collection, getDocs, query, where } from "firebase/firestore";

export default async function getCodeReviews(pullRequestNumber: number) {
  const q = query(
    collection(db, "reviews"),
    where("pullRequestNumber", "==", pullRequestNumber)
  );
  const docs = await getDocs(q);
  return docs.docs.map((doc) => doc.data());
}
