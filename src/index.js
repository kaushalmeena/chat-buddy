let BOT_BRAIN = null;

jQuery.fn.random = function () {
  const randomIndex = Math.floor(Math.random() * this.length);
  return jQuery(this[randomIndex]);
};

$(window).on("load", function () {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then(function (reg) {
        console.log("[ServiceWorker] Registered :", reg.scope);
      })
      .catch(function (err) {
        console.log("[ServiceWorker] Failed :", err);
      });
  }
});

$("#navChatTab").on("shown.bs.tab", function () {
  getMessage("Hello");
});

$(function () {
  $(".preloader").fadeOut("fast");
  initBuddy();
});

function initBuddy() {
  $.ajax({
    url: "./assets/brain/brain.xml",
    dataType: "xml",
    success(data) {
      BOT_BRAIN = data;
    },
    error() {
      alert("Error occured while fetching brain file.");
    },
  });
}

function isPatternMatched(pattern, message) {
  const regex = new RegExp(pattern, "i");
  return regex.test(message);
}

function getMessage(userMessage) {
  let botMessage = "Error! No pattern matched.";
  let botCode = "";

  let temp = null;

  $(BOT_BRAIN)
    .find("category")
    .each(function () {
      const pattern = $(this).find("pattern").text();
      if (isPatternMatched(pattern, userMessage)) {
        if ($(this).find("random").length > 0) {
          botMessage = $(this).find("random").children().random().text();
        } else {
          botMessage = $(this).find("template").text();
        }
        if ($(this).find("action").length > 0) {
          botCode = $(this).find("action").text();
        }
        return false;
      }
    });

  switch (botCode) {
    case "101": // Tell current date
      temp = new Date();
      $("#chatContent").html(`
        <span class="lead">
          ${temp.toString().slice(4, 15)}
        </span>
      `);
      break;
    case "102": // Tell current time
      temp = new Date();
      $("#chatContent").html(`
        <span class="lead">
          ${temp.toLocaleString("en-US", {
            hour: "numeric",
            minute: "numeric",
            hour12: true,
          })}
        </span>
      `);
      break;
    case "103": // Open google website
      window.open("https://www.google.co.in", "_blank");
      break;
    case "104": // Show random cat image
      $.ajax({
        url: "https://aws.random.cat/meow",
        type: "GET",
        dataType: "json",
        success(data) {
          $("#chatContent").html(
            `<img class="img-thumbnail" src="${data.file}" alt="Cat">`
          );
        },
        error() {
          $("#chatContent").text("Error ocuured while fetching cat.");
        },
      });
      break;
    case "105": // Show random dog image
      $.ajax({
        url: "https://random.dog/woof.json",
        type: "GET",
        dataType: "json",
        success(data) {
          $("#chatContent").html(
            `<img class="img-thumbnail" src="${data.url}" alt="Dog">`
          );
        },
        error() {
          $("#chatContent").text("Error ocuured while fetching dog.");
        },
      });
      break;
    case "106": // Show top anime list
      $.ajax({
        url: "https://api.jikan.moe/v3/top/anime",
        type: "GET",
        dataType: "json",
        success(data) {
          temp = `<ul>`;
          data.top.forEach(function (item) {
            temp += `<li class="media">
                      <img class="img-thumbnail" src="${item.image_url}" alt="Poster">
                      <div class="media-body my-auto">${item.title}</div>
                    </li>`;
          });
          temp += "</ul";
          $("#chatContent").html(temp);
        },
        error(e) {
          console.log(e);
          $("#chatContent").text("Error ocuured while fetching anime.");
        },
      });
      break;
    case "107": // Tell random joke
      $.ajax({
        url: "https://sv443.net/jokeapi/v2/joke/Any?type=single",
        type: "GET",
        dataType: "json",
        success(data) {
          $("#chatContent").html(`<span class="lead">${data.joke}</span>`);
        },
        error() {
          $("#chatContent").text("Error ocuured while fetching joke.");
        },
      });
      break;
    case "108": // Tell random number trivia
      $.ajax({
        url: "http://numbersapi.com/random/trivia",
        type: "GET",
        success(data) {
          $("#chatContent").html(`<span class="lead">${data}</span>`);
        },
        error() {
          $("#chatContent").text("Error ocuured while fetching fact.");
        },
      });
      break;
    default:
  }

  $("#chatOutput").text(botMessage);
  $("#chatInput").prop("disabled", false);
}

function sendMessage() {
  const userMessage = $("#chatInput").val();
  $("#chatContent").html("");
  $("#chatInput").prop("disabled", true);
  getMessage(userMessage);
}

function checkKeypress(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
}

function showChatTab() {
  $("#navChatTab").tab("show");
}
