"use strict";

const ui = {
  range: document.querySelector("#date-range"),
  videos: document.querySelector("#count-video"),
  analyses: document.querySelector("#count-analysis"),
  transcripts: document.querySelector("#count-transcript"),
  count: document.querySelector("#result-count"),
  list: document.querySelector("#video-list"),
  reader: document.querySelector("#reader"),
  search: document.querySelector("#search"),
  modes: [...document.querySelectorAll(".mode")],
  published: document.querySelector("#published-at"),
};

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});
let rows = [];
let mode = "analysis";
let selected = "";
let loaded = false;

function element(tag, name, content) {
  const node = document.createElement(tag);
  if (name) node.className = name;
  if (content != null) node.textContent = content;
  return node;
}

function windowDays() {
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(part => [part.type, part.value]));
  const end = `${parts.year}-${parts.month}-${parts.day}`;
  const first = new Date(`${end}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - 9);
  return [first.toISOString().slice(0, 10), end];
}

function urlFor(id, seconds) {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", id);
  if (Number.isInteger(seconds) && seconds >= 0) url.searchParams.set("t", `${seconds}s`);
  return url.href;
}

function videoLink(id, label, className, seconds) {
  const link = element("a", className, label);
  link.href = urlFor(id, seconds);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function timestamp(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function normalize(value) {
  return value.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, "");
}

function matching(videos) {
  const words = ui.search.value.trim().split(/\s+/u).map(normalize).filter(Boolean);
  return videos.filter(video => {
    const text = mode === "analysis"
      ? (video.analysis?.sections ?? []).flatMap(section => [section.title, section.text])
      : video.transcript.map(cue => cue.text);
    const haystack = normalize([video.title, video.day, ...text].join(" "));
    return words.every(word => haystack.includes(word));
  });
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const next = params.get("video") ?? "";
  selected = /^[A-Za-z0-9_-]{11}$/.test(next) ? next : "";
  mode = params.get("kind") === "transcript" ? "transcript" : "analysis";
}

function setHash() {
  if (!selected) return;
  const params = new URLSearchParams({video: selected, kind: mode});
  history.replaceState(null, "", `#${params}`);
}

function counter(videos) {
  ui.videos.textContent = videos.length;
  ui.analyses.textContent = videos.filter(video => video.analysis).length;
  ui.transcripts.textContent = videos.filter(video => video.transcript.length).length;
}

function renderCatalog(videos) {
  ui.list.replaceChildren();
  ui.count.textContent = `${videos.length} 条`;
  if (!videos.length) {
    ui.list.append(element("li", "placeholder", ui.search.value ? "没有匹配的视频。" : "当前窗口没有视频。"));
    return;
  }
  for (const video of videos) {
    const li = element("li");
    const button = element("button", "episode");
    button.type = "button";
    button.setAttribute("aria-current", String(video.id === selected));
    button.append(element("span", "episode-date", video.day), element("span", "episode-title", video.title));
    if (mode === "transcript") button.append(element("span", "episode-status", video.status));
    if (mode === "analysis" && !video.analysis) button.append(element("span", "episode-status", "整理稿待补"));
    button.addEventListener("click", () => {
      selected = video.id;
      setHash();
      for (const episode of ui.list.querySelectorAll(".episode")) {
        episode.setAttribute("aria-current", String(episode === button));
      }
      renderReader(video);
      ui.reader.focus({preventScroll: true});
      if (matchMedia("(max-width: 640px)").matches) ui.reader.scrollIntoView({block: "start"});
    });
    li.append(button);
    ui.list.append(li);
  }
}

function renderPassage(video, section, isFramework) {
  const box = element("section", isFramework ? "passage framework" : "passage");
  box.append(element("h4", "", section.title), element("p", "", section.text));
  const refs = element("div", "time-list");
  for (const seconds of section.seconds) {
    refs.append(videoLink(video.id, timestamp(seconds), "time-link", seconds));
  }
  box.append(refs);
  return box;
}

function renderReader(video) {
  ui.reader.replaceChildren();
  if (!video) {
    ui.reader.append(element("p", "placeholder",
      ui.search.value ? "可以试试股票代码或更短的关键词。" : "当前窗口暂无资料。"));
    return;
  }
  const meta = element("div", "article-meta");
  const day = element("time", "article-date", video.day);
  day.dateTime = video.day;
  meta.append(day, videoLink(video.id, "打开原视频 ↗", "external"));
  ui.reader.append(meta, element("h2", "article-title", video.title));
  if (mode === "transcript") {
    ui.reader.append(element("h3", "section-heading", "原文稿"));
    if (!video.transcript.length) {
      ui.reader.append(element("p", "placeholder", "这条视频的原文稿待归档。可先打开原视频，或切换到整理稿。"));
      return;
    }
    ui.reader.append(element("p", "source-meta", video.status));
    for (const cue of video.transcript) {
      const box = element("section", "passage");
      if (Number.isInteger(cue.seconds)) {
        box.append(videoLink(video.id, timestamp(cue.seconds), "time-link", cue.seconds));
      }
      box.append(element("p", "", cue.text));
      ui.reader.append(box);
    }
    return;
  }
  if (!video.analysis) {
    ui.reader.append(element("p", "placeholder", "这条视频的整理稿待补。"));
    return;
  }
  const note = video.analysis;
  ui.reader.append(element("p", "source-meta", `文字稿来自 ${note.transcript_source} · ${note.editor} 整理`));
  const groups = [
    ["content_summary", "内容概要", false],
    ["analysis_framework", "博主的分析思路", true],
  ];
  for (const [kind, title, isFramework] of groups) {
    ui.reader.append(element("h3", isFramework ? "section-heading framework" : "section-heading", title));
    for (const section of note.sections.filter(section => section.kind === kind)) {
      ui.reader.append(renderPassage(video, section, isFramework));
    }
  }
  ui.reader.append(element("p", "article-note", note.limitations));
}

function render() {
  if (!loaded) return;
  const [start, end] = windowDays();
  ui.range.textContent = `${start} 至 ${end} · 北京时间`;
  const active = rows.filter(video => video.day >= start && video.day <= end);
  counter(active);
  for (const button of ui.modes) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  const visible = matching(active);
  if (!visible.some(video => video.id === selected)) selected = visible[0]?.id ?? "";
  renderCatalog(visible);
  renderReader(visible.find(video => video.id === selected));
}

readHash();
for (const button of ui.modes) {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    render();
    setHash();
  });
}
ui.search.addEventListener("input", render);
window.addEventListener("hashchange", () => {
  readHash();
  render();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});
setInterval(render, 60_000);

fetch("./library.json", {credentials: "same-origin", cache: "no-cache"})
  .then(response => {
    if (!response.ok) throw new Error("library");
    return response.json();
  })
  .then(data => {
    rows = data.videos;
    ui.published.textContent = `资料更新于 ${data.published_at.slice(0, 16).replace("T", " ")}`;
    loaded = true;
    render();
  })
  .catch(() => {
    ui.reader.replaceChildren(element("p", "placeholder", "资料暂时无法载入。请刷新页面重试。"));
  });
