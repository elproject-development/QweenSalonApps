import app from "./server.js";

const port = process.env.PORT || 3002;

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
