var BOT_BRAIN = null;

jQuery.fn.random = function () {
  var randomIndex = Math.floor(Math.random() * this.length);
  return jQuery(this[randomIndex]);
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js')
      .then(function (reg) {
        console.log('[ServiceWorker] Registered :', reg.scope);
      })
      .catch(function (err) {
        console.log('[ServiceWorker] Failed :', err);
      });
  })
}

$(document).ready(function () {
  $(".preloader").fadeOut("fast");
  initBuddy();
});

$("#navChatTab").on('shown.bs.tab', function () {
  getMessage("Hello");
});

function initBuddy() {
  $.ajax({
    url: "./assets/brain/brain.xml",
    dataType: "xml",
    success: function (data) {
      BOT_BRAIN = data;
    },
    error: function () {
      alert("Error occured while fetching brain file.");
    }
  });
}

function matchPattern(pattern, message) {
  var regex = new RegExp(pattern, "i");
  return regex.test(message);
}

function getMessage(userMessage) {
  var botMessage = "Error! No pattern matched.";
  var botCode = "";

  var pattern = "";
  var temp = null;

  $(BOT_BRAIN).find('category').each(function () {
    pattern = $(this).find("pattern").text();
    if (matchPattern(pattern, userMessage)) {
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
    case "101":
      temp = new Date();
      $("#chatContent").html("<span class='lead'>" + temp.toString().slice(4, 15) + "</span>");
      break;
    case "102":
      temp = new Date();
      $("#chatContent").html("<span class='lead'>" + temp.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }) + "</span>");
      break;
    case "103":
      window.open('https://www.google.co.in', '_blank');
      break;
    case "104":
      $.ajax({
        url: 'https://aws.random.cat/meow',
        type: 'GET',
        dataType: 'json',
        success: function (data) {
          $("#chatContent").html("<img class='img-thumbnail' src='" + data.file + "' alt='Cat'>");
        },
        error: function () {
          $("#chatContent").text("Error ocuured while fetching cat.");
        }
      });
      break;
    case "105":
      $.ajax({
        url: 'https://random.dog/woof.json',
        type: 'GET',
        dataType: 'json',
        success: function (data) {
          $("#chatContent").html("<img class='img-thumbnail img-max-height' src='" + data.url + "' alt='Dog'>");
        },
        error: function () {
          $("#chatContent").text("Error ocuured while fetching dog.");
        }
      });
      break;
    case "106":
      $.ajax({
        url: 'https://api.jikan.moe/v3/top/anime',
        type: 'GET',
        dataType: 'json',
        success: function (data) {
          temp = "<ul class='list-unstyled'>";
          data.top.forEach(function (item) {
            temp += "<li class='media'>";
            temp += "<img class='img-thumbnail' src='" + item.image_url + "' alt='Poster'>";
            temp += "<div class='media-body my-auto'>" + item.title + "</div>";
            temp += "</li>";
          });
          temp += "</ul";
          $("#chatContent").html(temp);
        },
        error: function (e) {
          console.log(e)
          $("#chatContent").text("Error ocuured while fetching anime.");
        }
      });
      break;
    case "107":
      $.ajax({
        url: 'https://sv443.net/jokeapi/v2/joke/Any?type=single',
        type: 'GET',
        dataType: 'json',
        success: function (data) {
          $("#chatContent").html("<span class='lead'>" + data.joke + "</span>");
        },
        error: function () {
          $("#chatContent").text("Error ocuured while fetching joke.");
        }
      });
      break;
    case "108":
      $.ajax({
        url: 'http://numbersapi.com/random/trivia',
        type: 'GET',
        success: function (data) {
          $("#chatContent").html("<span class='lead'>" + data + "</span>");
        },
        error: function () {
          $("#chatContent").text("Error ocuured while fetching fact.");
        }
      });
      break;
  }

  $("#chatOutput").text(botMessage);
  $("#chatInput").prop("disabled", false);
}

function sendMessage() {
  var userMessage = $("#chatInput").val();
  $("#chatContent").html("");
  $("#chatInput").prop("disabled", true);
  getMessage(userMessage);
}

function checkKeypress(event) {
  if (event.keyCode == 13) {
    sendMessage();
  }
}

function getTime() {
  var d = new Date();
  var h = d.getHours();
  var m = d.getMinutes();
  var suffix = (h >= 12) ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  h = h < 10 ? '0' + h : h;
  m = m < 10 ? '0' + m : m;
  return h + ":" + m + " " + suffix;
}

function showChatTab() {
  $("#navChatTab").tab('show');
}