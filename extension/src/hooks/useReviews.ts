import { useEffect, useState } from "react";

import getCodeReviews from "../api";

export default function useReviews(pullRequestNumber?: number) {
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchCodeReview(pullRequestNumber: number) {
      setIsLoading(true);
      try {
        const codeReviews = await getCodeReviews(pullRequestNumber);
        console.log(codeReviews, "codeReviews@@@@@@@@@@@@@@@@@@@@@@@@@@@");
      } catch (error: any) {
        console.log("error", error);
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    }
    console.log("pullRequestNumber2", pullRequestNumber);
    if (pullRequestNumber !== undefined) {
      console.log("pullRequestNumber", pullRequestNumber);
      fetchCodeReview(pullRequestNumber);
    }
  }, [pullRequestNumber]);

  return { reviews, isLoading, error };
}
