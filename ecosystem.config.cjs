module.exports = {
  apps: [
    {
      name: "gonokami-bot",
      script: "index.js",
      restart_delay: 5000,
      stop_exit_codes: [0],
      exp_backoff_restart_delay: 100,
      watch: false,
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
