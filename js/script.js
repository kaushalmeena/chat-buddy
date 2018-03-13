jQuery.fn.random = function () {
    var randomIndex = Math.floor(Math.random() * this.length);
    return jQuery(this[randomIndex]);
};

function initBuddy() {
    getMessage("hello");
}

function getMessage(userMessage) {
    var botMessage = "Error! No pattern matched.";
    var botResult = false;
    var botRegex = null;
    var botCode = 100;

    $.get("./brain/brain.xml", function (data) {
        $(data).find('category').each(function () {
            botRegex = new RegExp($(this).find("pattern").text(), "i");
            if (botRegex.test(userMessage)) {
                if ($(this).find("random").length > 0) {
                    botMessage = $(this).find("random").children().random().text();
                } else {
                    botMessage = $(this).find("template").text();
                }
                if ($(this).find("action").length > 0) {
                    botCode = parseInt($(this).find("action").text(), 10);
                }
                return false;
            }
        });
    }, "xml").done(function () {
        switch (botCode) {
            case 100:
                break;
            case 101:
                botResult = new Date().toString().slice(4, 15);
                botMessage += " " + botResult;
                break;
            case 102:
                botResult = getTime();
                botMessage += " " + botResult;
                break;
            case 103:
                botResult = window.open('https://www.google.co.in', '_blank');
                break;
            case 104:
                $.getJSON("https://newsapi.org/v1/articles?source=the-times-of-india&sortBy=top&apiKey=15a4cab718bf42f78eab7b55b2a564f4", function (data) {
                    if (data.status == "ok") {
                        botResult = '<ul class="list-unstyled">';
                        $.each(data.articles, function (index, object) {
                            botResult += '<li class="media"><a href="' + object.url + '"><img class="d-flex mr-3" width="150" src="' + object.urlToImage + '" alt="article-img" ></a><div class="media-body"><a href="' + object.url + '"><h5 class="mt-0 mb-1">' + object.title + '</h5></a>' + object.description + '</div></li>';
                        });
                        botResult += '</ul>';
                        $("#chatInfo").html(botResult);
                    } else {
                        showAlert(data.message);
                    }
                });
                break;
            case 105:
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(successFunction, errorFunction);
                } else {
                    showAlert('It seems like Geolocation, which is required for this page, is not enabled in your browser. Please use a browser which supports it.');
                }
                break;
            case 106:
                $.ajax({
                    url: 'https://icanhazdadjoke.com',
                    type: 'GET',
                    dataType: 'json',
                    success: function (data) {
                        if (data.status == 200) {
                            $("#chatInfo").html("<h2>" + data.joke + "</h2>");
                        } else {
                            showAlert("Error ocuured while fetching joke.");
                        }
                    },
                    error: function () {
                        showAlert("Error ocuured while fetching joke.");
                    },
                    beforeSend: function (request) {
                        request.setRequestHeader("Accept", 'application/json');
                    }
                });
                break;
            case 107:
                $.ajax({
                    url: 'http://numbersapi.com/random/trivia',
                    type: 'GET',
                    success: function (data) {
                        $("#chatInfo").html("<h2>" + data + "</h2>");
                    },
                    error: function () {
                        showAlert("Error ocuured while fetching joke.");
                    }
                });
                break;
        }

        $("#chatOutput").html(botMessage);
        $("#chatInput").prop("disabled", false);
        $("#chatLoader").remove();
    }).fail(function () {
        showAlert("Error occured while fetching brain file.");
    });
}

function successFunction(position) {
    var result = null;
    $.getJSON("http://api.openweathermap.org/data/2.5/weather?lat=" + position.coords.latitude + "&lon=" + position.coords.longitude + "&units=metric&appid=fc52421fcefbd3b5f005c3f24d0ac577", function (data) {
        result = '<table class="table table-sm"><tbody>';
        result += '<tr><td><strong>Weather<strong></td><td>' + data.weather[0].description + '</td></tr>';
        result += '<tr><td><strong>Temperature<strong></td><td>' + data.main.temp + '<sup>o</sup>C (' + data.main.temp_min + '<sup>o</sup>C-' + data.main.temp_max + '<sup>o</sup>C)</td></tr>';
        result += '<tr><td><strong>Humidity<strong></td><td>' + data.main.humidity + ' %</td></tr>';
        result += '<tr><td><strong>Pressure<strong></td><td>' + data.main.pressure + ' hPa</td></tr>';
        result += '</tbody></table>';
        $("#chatInfo").html(result);
    });
}

function errorFunction() {
    showAlert("Error occured while using geolocation.");
}

function sendMessage() {
    var userMessage = $("#chatInput").val();
    $("#chatInfo").html("");
    $("#chatInput").prop("disabled", true);
    $("#chatOutput").html("<div id='chatLoader' class='container text-grey text-center'><span class='fa fa-cog fa-spin fa-3x fa-fw'></span></div>");
    getMessage(userMessage);
}

function checkKeypress(event) {
    if (event.keyCode == 13) {
        sendMessage();
    }
}

function showAlert(text) {
    $("#alertTxt").text(text);
    $("#alertDiv").fadeIn();
}

function hideAlert() {
    $("#alertDiv").fadeOut();
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