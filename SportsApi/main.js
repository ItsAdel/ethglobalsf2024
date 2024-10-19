const request = require("request");

const options = {
  method: "GET",
  url: "https://api-nba-v1.p.rapidapi.com/games",
  qs: { date: "2024-10-19" },
  headers: {
    "x-rapidapi-key": "54292970ccmshdb6f7be9fea2695p1b5ae1jsn8aa12d8fa73b",
    "x-rapidapi-host": "api-nba-v1.p.rapidapi.com",
  },
};

request(options, function (error, response, body) {
  if (error) throw new Error(error);
  //   console.log(JSON.parse(body).response);
  console.log(resolveGames(JSON.parse(body).response));
});

function resolveGames(apiResponse) {
  const games = apiResponse; // Get the array of games
  const results = []; // Array to hold the processed game data

  games.forEach((game) => {
    // Extracting relevant information

    if (game.status.long == "Scheduled") {
      const gameSummary = {
        id: game.id,
        date: game.date.start,
        visitor_name: visitors.name,
        home_name: home.name,
        winner: "TBD",
      };

      results.push(gameSummary);
    } else if (game.status.long == "Finished") {
      const visitors = game.teams.visitors;
      const home = game.teams.home;
      const visitorsPoints = game.scores.visitors.points;
      const homePoints = game.scores.home.points;

      // Determine the winner
      const winner = visitorsPoints > homePoints ? visitors.name : home.name;

      // Create a game summary object
      const gameSummary = {
        id: game.id,
        date: game.date.start, // Game date
        visitor_name: visitors.name,
        home_name: home.name,
        winner: winner, // Winning team
      };

      results.push(gameSummary);
    }
  });

  return results;
}

// its a valid game and this is the id for the game
//
