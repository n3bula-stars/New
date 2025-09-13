let _CONFIG = {
  wispurl: localStorage.getItem("proxServer") || (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/wisp/",
  bareurl: "/bare/",
};
