export interface Review {
  pullRequestNumber: number;
  review: {
    custom_id: string;
    error: string;
    id: string;
    response: {
      status_code: number;
      request_id: string;
      body: {
        choices: {
          message: {
            content: string;
          };
        }[];
      };
    };
  };
}
