module.exports = {
  apps: [{
    name: "arcorigin",
    script: "pnpm",
    args: "start",
    cwd: __dirname,
    env: { NODE_ENV: "production", PORT: "3000" },
  }],
};
