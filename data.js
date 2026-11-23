// Vespera catalog — details only (no streaming).
// type: movie | tv | anime   ·   network = original studio / channel
window.VESPERA_TITLES = [
  // ---------- Movies ----------
  { id: "dune-part-two", title: "Dune: Part Two", type: "movie", year: 2024, genres: ["Sci-Fi", "Adventure"], by: "Denis Villeneuve", cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson"], network: "Legendary / Warner Bros.",
    synopsis: "Paul Atreides joins the Fremen of Arrakis and wrestles with a prophecy that could free a desert world — or set the galaxy on fire." },
  { id: "oppenheimer", title: "Oppenheimer", type: "movie", year: 2023, genres: ["Drama", "History"], by: "Christopher Nolan", cast: ["Cillian Murphy", "Emily Blunt", "Robert Downey Jr."], network: "Universal",
    synopsis: "The physicist who led the Manhattan Project lives with the weight of what he built, before and long after the first test in the New Mexico desert." },
  { id: "parasite", title: "Parasite", type: "movie", year: 2019, genres: ["Thriller", "Drama"], by: "Bong Joon Ho", cast: ["Song Kang-ho", "Lee Sun-kyun", "Cho Yeo-jeong"], network: "CJ Entertainment",
    synopsis: "A struggling family talks its way, one job at a time, into the household of a wealthy one — until a secret beneath the house changes everything." },
  { id: "everything-everywhere", title: "Everything Everywhere All at Once", type: "movie", year: 2022, genres: ["Sci-Fi", "Comedy"], by: "Daniel Kwan & Daniel Scheinert", cast: ["Michelle Yeoh", "Ke Huy Quan", "Stephanie Hsu"], network: "A24",
    synopsis: "A laundromat owner in the middle of a tax audit discovers she can borrow the skills of her other selves across the multiverse." },
  { id: "the-dark-knight", title: "The Dark Knight", type: "movie", year: 2008, genres: ["Action", "Crime"], by: "Christopher Nolan", cast: ["Christian Bale", "Heath Ledger", "Aaron Eckhart"], network: "Warner Bros.",
    synopsis: "Gotham's vigilante, its new district attorney and a chaos-loving criminal collide in a contest over the city's soul." },
  { id: "mad-max-fury-road", title: "Mad Max: Fury Road", type: "movie", year: 2015, genres: ["Action", "Adventure"], by: "George Miller", cast: ["Tom Hardy", "Charlize Theron", "Nicholas Hoult"], network: "Warner Bros.",
    synopsis: "In a wasteland ruled by a warlord, a rebel driver and a drifter flee across the desert in a single, relentless chase." },
  { id: "arrival", title: "Arrival", type: "movie", year: 2016, genres: ["Sci-Fi", "Drama"], by: "Denis Villeneuve", cast: ["Amy Adams", "Jeremy Renner", "Forest Whitaker"], network: "Paramount",
    synopsis: "A linguist races to understand the language of visitors from elsewhere, and finds it rearranging how she experiences time." },
  { id: "get-out", title: "Get Out", type: "movie", year: 2017, genres: ["Horror", "Thriller"], by: "Jordan Peele", cast: ["Daniel Kaluuya", "Allison Williams", "Catherine Keener"], network: "Universal / Blumhouse",
    synopsis: "A weekend meeting his girlfriend's parents turns from awkward to sinister as a young man uncovers what the family really wants." },
  { id: "interstellar", title: "Interstellar", type: "movie", year: 2014, genres: ["Sci-Fi", "Drama"], by: "Christopher Nolan", cast: ["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain"], network: "Paramount / Warner Bros.",
    synopsis: "With Earth failing, a former pilot leaves his children behind to search for a new home through a wormhole near Saturn." },
  { id: "grand-budapest-hotel", title: "The Grand Budapest Hotel", type: "movie", year: 2014, genres: ["Comedy", "Adventure"], by: "Wes Anderson", cast: ["Ralph Fiennes", "Tony Revolori", "Saoirse Ronan"], network: "Searchlight",
    synopsis: "A legendary concierge and his loyal lobby boy are swept into a caper over a stolen painting and a contested fortune." },
  { id: "jurassic-park", title: "Jurassic Park", type: "movie", year: 1993, genres: ["Adventure", "Sci-Fi"], by: "Steven Spielberg", cast: ["Sam Neill", "Laura Dern", "Jeff Goldblum"], network: "Universal",
    synopsis: "A preview tour of an island theme park goes badly wrong when its genetically revived residents slip their fences." },
  { id: "pulp-fiction", title: "Pulp Fiction", type: "movie", year: 1994, genres: ["Crime", "Drama"], by: "Quentin Tarantino", cast: ["John Travolta", "Uma Thurman", "Samuel L. Jackson"], network: "Miramax",
    synopsis: "Hitmen, a boxer, a gangster's wife and two diner robbers cross paths in a out-of-order tangle of Los Angeles stories." },
  { id: "the-matrix", title: "The Matrix", type: "movie", year: 1999, genres: ["Sci-Fi", "Action"], by: "The Wachowskis", cast: ["Keanu Reeves", "Laurence Fishburne", "Carrie-Anne Moss"], network: "Warner Bros.",
    synopsis: "A hacker learns the world he knows is a simulation and joins the people fighting the machines that built it." },
  { id: "se7en", title: "Se7en", type: "movie", year: 1995, genres: ["Thriller", "Crime"], by: "David Fincher", cast: ["Brad Pitt", "Morgan Freeman", "Gwyneth Paltrow"], network: "New Line",
    synopsis: "Two detectives in a rain-soaked city hunt a killer whose crimes are built around the seven deadly sins." },
  { id: "hereditary", title: "Hereditary", type: "movie", year: 2018, genres: ["Horror", "Drama"], by: "Ari Aster", cast: ["Toni Collette", "Alex Wolff", "Milly Shapiro"], network: "A24",
    synopsis: "After a grandmother's death, a family begins to unravel as they learn what she may have left them." },
  { id: "knives-out", title: "Knives Out", type: "movie", year: 2019, genres: ["Mystery", "Comedy"], by: "Rian Johnson", cast: ["Daniel Craig", "Ana de Armas", "Chris Evans"], network: "Lionsgate",
    synopsis: "A famous crime novelist dies the night after his birthday, and an eccentric detective suspects every member of his family." },
  { id: "gone-girl", title: "Gone Girl", type: "movie", year: 2014, genres: ["Thriller", "Mystery"], by: "David Fincher", cast: ["Ben Affleck", "Rosamund Pike", "Neil Patrick Harris"], network: "20th Century",
    synopsis: "On their fifth anniversary a woman vanishes, and her husband becomes the story everyone is watching." },

  // ---------- Series ----------
  { id: "breaking-bad", title: "Breaking Bad", type: "tv", year: 2008, genres: ["Crime", "Drama"], by: "Vince Gilligan", cast: ["Bryan Cranston", "Aaron Paul", "Anna Gunn"], network: "AMC",
    synopsis: "A chemistry teacher with a terminal diagnosis turns to cooking meth with a former student — and discovers a taste for power." },
  { id: "better-call-saul", title: "Better Call Saul", type: "tv", year: 2015, genres: ["Crime", "Drama"], by: "Vince Gilligan & Peter Gould", cast: ["Bob Odenkirk", "Rhea Seehorn", "Jonathan Banks"], network: "AMC",
    synopsis: "Small-time lawyer Jimmy McGill bends, then breaks, the rules on his way to becoming someone else entirely." },
  { id: "dark", title: "Dark", type: "tv", year: 2017, genres: ["Sci-Fi", "Mystery"], by: "Baran bo Odar & Jantje Friese", cast: ["Louis Hofmann", "Lisa Vicari", "Andreas Pietschmann"], network: "Netflix",
    synopsis: "A child's disappearance in a small German town exposes four families bound together across several generations of time." },
  { id: "the-bear", title: "The Bear", type: "tv", year: 2022, genres: ["Drama", "Comedy"], by: "Christopher Storer", cast: ["Jeremy Allen White", "Ebon Moss-Bachrach", "Ayo Edebiri"], network: "FX",
    synopsis: "A fine-dining chef comes home to Chicago to run his late brother's chaotic sandwich shop." },
  { id: "severance", title: "Severance", type: "tv", year: 2022, genres: ["Sci-Fi", "Thriller"], by: "Dan Erickson", cast: ["Adam Scott", "Britt Lower", "Zach Cherry"], network: "Apple TV+",
    synopsis: "Office workers have their memories surgically split between work and home — and their work selves start asking questions." },
  { id: "succession", title: "Succession", type: "tv", year: 2018, genres: ["Drama"], by: "Jesse Armstrong", cast: ["Brian Cox", "Jeremy Strong", "Sarah Snook"], network: "HBO",
    synopsis: "The children of a media mogul circle the throne as their father refuses to let go of it." },
  { id: "chernobyl", title: "Chernobyl", type: "tv", year: 2019, genres: ["History", "Drama"], by: "Craig Mazin", cast: ["Jared Harris", "Stellan Skarsgård", "Emily Watson"], network: "HBO",
    synopsis: "A dramatization of the 1986 nuclear disaster and the people who paid to contain it — and to tell the truth about it." },
  { id: "fallout", title: "Fallout", type: "tv", year: 2024, genres: ["Sci-Fi", "Adventure"], by: "Geneva Robertson-Dworet & Graham Wagner", cast: ["Ella Purnell", "Walton Goggins", "Aaron Moten"], network: "Prime Video",
    synopsis: "Two centuries after the bombs, a sheltered vault dweller steps out into a wasteland that is stranger and crueler than she was told." },
  { id: "stranger-things", title: "Stranger Things", type: "tv", year: 2016, genres: ["Sci-Fi", "Horror"], by: "The Duffer Brothers", cast: ["Millie Bobby Brown", "Winona Ryder", "David Harbour"], network: "Netflix",
    synopsis: "A boy vanishes in 1980s Indiana, and his friends find a girl with strange powers and a door to somewhere else." },
  { id: "the-sopranos", title: "The Sopranos", type: "tv", year: 1999, genres: ["Crime", "Drama"], by: "David Chase", cast: ["James Gandolfini", "Edie Falco", "Lorraine Bracco"], network: "HBO",
    synopsis: "A New Jersey mob boss starts seeing a therapist as the pressures of his two families close in." },
  { id: "shogun", title: "Shōgun", type: "tv", year: 2024, genres: ["History", "Drama"], by: "Rachel Kondo & Justin Marks", cast: ["Hiroyuki Sanada", "Cosmo Jarvis", "Anna Sawai"], network: "FX",
    synopsis: "In feudal Japan, a shipwrecked English navigator becomes a pawn — and then a player — in a lord's fight for survival." },
  { id: "true-detective", title: "True Detective", type: "tv", year: 2014, genres: ["Crime", "Mystery"], by: "Nic Pizzolatto", cast: ["Matthew McConaughey", "Woody Harrelson", "Michelle Monaghan"], network: "HBO",
    synopsis: "Two Louisiana detectives revisit a ritualistic murder case that consumed them seventeen years earlier." },
  { id: "mindhunter", title: "Mindhunter", type: "tv", year: 2017, genres: ["Crime", "Thriller"], by: "Joe Penhall", cast: ["Jonathan Groff", "Holt McCallany", "Anna Torv"], network: "Netflix",
    synopsis: "In the late 1970s, two FBI agents interview imprisoned killers to understand how they think." },
  { id: "friends", title: "Friends", type: "tv", year: 1994, genres: ["Comedy"], by: "David Crane & Marta Kauffman", cast: ["Jennifer Aniston", "Matthew Perry", "Lisa Kudrow"], network: "NBC",
    synopsis: "Six friends in Manhattan navigate jobs, romances and one very orange couch at their favorite coffee house." },
  { id: "twin-peaks", title: "Twin Peaks", type: "tv", year: 1990, genres: ["Mystery", "Drama"], by: "Mark Frost & David Lynch", cast: ["Kyle MacLachlan", "Sheryl Lee", "Michael Ontkean"], network: "ABC",
    synopsis: "An FBI agent arrives in a misty logging town to investigate a homecoming queen's murder, and finds its secrets go very deep." },

  // ---------- Anime ----------
  { id: "spirited-away", title: "Spirited Away", type: "anime", format: "Film", year: 2001, genres: ["Fantasy", "Adventure"], by: "Hayao Miyazaki", cast: ["Rumi Hiiragi", "Miyu Irino"], network: "Studio Ghibli",
    synopsis: "A girl wanders into a bathhouse for spirits and must work there to free her parents and find her way home." },
  { id: "princess-mononoke", title: "Princess Mononoke", type: "anime", format: "Film", year: 1997, genres: ["Fantasy", "Adventure"], by: "Hayao Miyazaki", cast: ["Yōji Matsuda", "Yuriko Ishida"], network: "Studio Ghibli",
    synopsis: "A cursed prince travels west and finds himself between an iron-working town and the forest gods it is destroying." },
  { id: "your-name", title: "Your Name.", type: "anime", format: "Film", year: 2016, genres: ["Romance", "Fantasy"], by: "Makoto Shinkai", cast: ["Ryunosuke Kamiki", "Mone Kamishiraishi"], network: "CoMix Wave Films",
    synopsis: "A city boy and a country girl begin waking up in each other's bodies, tied together by a comet." },
  { id: "cowboy-bebop", title: "Cowboy Bebop", type: "anime", format: "Series", year: 1998, genres: ["Sci-Fi", "Action"], by: "Shinichirō Watanabe", cast: [], network: "Sunrise",
    synopsis: "A crew of broke bounty hunters drifts across the solar system, chasing paychecks and outrunning their pasts." },
  { id: "attack-on-titan", title: "Attack on Titan", type: "anime", format: "Series", year: 2013, genres: ["Action", "Fantasy"], by: "Based on Hajime Isayama", cast: [], network: "Wit Studio / MAPPA",
    synopsis: "Humanity lives behind enormous walls to hide from giants — until the day the walls are breached." },
  { id: "fma-brotherhood", title: "Fullmetal Alchemist: Brotherhood", type: "anime", format: "Series", year: 2009, genres: ["Fantasy", "Adventure"], by: "Based on Hiromu Arakawa", cast: [], network: "Bones",
    synopsis: "Two brothers who paid a terrible price for breaking alchemy's rules search for a way to restore their bodies." },
  { id: "evangelion", title: "Neon Genesis Evangelion", type: "anime", format: "Series", year: 1995, genres: ["Sci-Fi", "Drama"], by: "Hideaki Anno", cast: [], network: "Gainax / Tatsunoko",
    synopsis: "A reluctant teenager is ordered to pilot a giant bio-machine against mysterious beings attacking Tokyo-3." },
  { id: "frieren", title: "Frieren: Beyond Journey's End", type: "anime", format: "Series", year: 2023, genres: ["Fantasy", "Adventure"], by: "Based on Kanehito Yamada & Tsukasa Abe", cast: [], network: "Madhouse",
    synopsis: "After her party defeats the Demon King, an elf mage sets out to understand the people she outlived." },
  { id: "death-note", title: "Death Note", type: "anime", format: "Series", year: 2006, genres: ["Thriller", "Mystery"], by: "Based on Tsugumi Ohba & Takeshi Obata", cast: [], network: "Madhouse",
    synopsis: "A top student finds a notebook that kills anyone whose name is written in it, and a brilliant detective starts closing in." },
];

// "Constellations" — curated universes / collections
window.VESPERA_COLLECTIONS = [
  { id: "nolan", name: "The Nolan Files", blurb: "Time, memory and very large IMAX cameras.", ids: ["oppenheimer", "interstellar", "the-dark-knight"] },
  { id: "albuquerque", name: "Albuquerque After Dark", blurb: "One desert city, two legendary descents.", ids: ["breaking-bad", "better-call-saul"] },
  { id: "ghibli", name: "Ghibli Skies", blurb: "Spirits, forests and wonder drawn by hand.", ids: ["spirited-away", "princess-mononoke"] },
  { id: "villeneuve", name: "Villeneuve Worlds", blurb: "Vast silences and vaster landscapes.", ids: ["dune-part-two", "arrival"] },
  { id: "fincher", name: "Fincher Noir", blurb: "Cold light, careful frames, nobody innocent.", ids: ["se7en", "gone-girl", "mindhunter"] },
  { id: "time-benders", name: "Time Benders", blurb: "Stories that refuse to run in a straight line.", ids: ["dark", "arrival", "interstellar", "everything-everywhere"] },
];

// Home rows: [label, filter]
window.VESPERA_ROWS = [
  { label: "Tonight's Pick for You", pick: ["severance", "dune-part-two", "the-bear", "frieren", "knives-out", "shogun", "parasite", "fallout"] },
  { label: "Can't Stop Talking About It", pick: ["shogun", "the-bear", "fallout", "oppenheimer", "severance", "dune-part-two", "frieren"] },
  { label: "Minds, Thoroughly Bent", genre: "Sci-Fi" },
  { label: "Leave a Light On", genre: "Horror" },
  { label: "Crime, Mostly Unpunished", genre: "Crime" },
  { label: "Hand-Drawn Wonders", type: "anime" },
  { label: "The Twist You Didn't Call", genre: "Mystery" },
  { label: "One More Episode, Promise", type: "tv" },
  { label: "Before the Millennium", before: 2000 },
  { label: "Pulled from Real History", genre: "History" },
];

// ---------- Live mode (TMDB) ----------
// Home rows when a TMDB key is set. path = TMDB endpoint, params = query string.
window.VESPERA_TMDB_ROWS = [
  { label: "Tonight's Pick for You", path: "trending/all/week" },
  { label: "Can't Stop Talking About It", path: "trending/tv/week" },
  { label: "Fresh in Cinemas", path: "movie/now_playing", kind: "movie" },
  { label: "Minds, Thoroughly Bent", path: "discover/movie", kind: "movie", params: { with_genres: "878", "vote_count.gte": 300 } },
  { label: "Leave a Light On", path: "discover/movie", kind: "movie", params: { with_genres: "27", "vote_count.gte": 300 } },
  { label: "Crime, Mostly Unpunished", path: "discover/tv", kind: "tv", params: { with_genres: "80", "vote_count.gte": 200 } },
  { label: "Hand-Drawn Wonders", path: "discover/tv", kind: "tv", params: { with_genres: "16", with_original_language: "ja", "vote_count.gte": 100 }, more: "#/anime" },
  { label: "The Twist You Didn't Call", path: "discover/movie", kind: "movie", params: { with_genres: "9648", "vote_count.gte": 300 } },
  { label: "One More Episode, Promise", path: "tv/top_rated", kind: "tv", more: "#/series" },
  { label: "Before the Millennium", path: "discover/movie", kind: "movie", params: { "primary_release_date.lte": "1999-12-31", sort_by: "vote_count.desc" } },
  { label: "Pulled from Real History", path: "discover/movie", kind: "movie", params: { with_genres: "36", "vote_count.gte": 200 } },
  { label: "Critics' Darlings", path: "movie/top_rated", kind: "movie", more: "#/movies?sort=top" },
];

// Section landing pages in live mode. A row with `spotlight: true` renders as a Spotlight panel.
{
const mv = (g, extra = {}) => ({ path: "discover/movie", kind: "movie", params: { with_genres: g, "vote_count.gte": 300, ...extra } });
const tv = (g, extra = {}) => ({ path: "discover/tv", kind: "tv", params: { with_genres: g, "vote_count.gte": 150, ...extra } });
const an = (g, extra = {}) => ({ path: "discover/tv", kind: "tv", params: { with_genres: ["16", g].filter(Boolean).join(","), with_original_language: "ja", "vote_count.gte": 50, ...extra } });
window.VESPERA_SECTIONS = {
  movies: {
    hero: { path: "movie/popular", kind: "movie" },
    top10: { label: "Top 10 Films Today", path: "trending/movie/day", kind: "movie" },
    rows: [
      { label: "Popular Right Now", path: "movie/popular", kind: "movie" },
      { label: "Fresh in Cinemas", path: "movie/now_playing", kind: "movie" },
      { label: "Big Screen, Big Noise", ...mv("28") },
      { label: "Spotlight · Sci-Fi Worlds", spotlight: true, ...mv("878") },
      { label: "Laugh Till It Hurts", ...mv("35") },
      { label: "Leave a Light On", ...mv("27") },
      { label: "Edge-of-Seat Thrillers", ...mv("53") },
      { label: "Spotlight · Love Stories", spotlight: true, ...mv("10749") },
      { label: "Family Night In", ...mv("10751") },
      { label: "Animated Wonders", ...mv("16") },
      { label: "The Case Files", ...mv("9648") },
      { label: "War Stories", ...mv("10752") },
      { label: "Pulled from Real History", ...mv("36") },
      { label: "Critics' Darlings", path: "movie/top_rated", kind: "movie" },
      { label: "Coming Soon", path: "movie/upcoming", kind: "movie" },
    ],
  },
  series: {
    hero: { path: "tv/popular", kind: "tv" },
    top10: { label: "Top 10 Series Today", path: "trending/tv/day", kind: "tv" },
    rows: [
      { label: "Popular Right Now", path: "tv/popular", kind: "tv" },
      { label: "On the Air This Week", path: "tv/on_the_air", kind: "tv" },
      { label: "Comedy Comfort", ...tv("35") },
      { label: "Spotlight · Crime Empires", spotlight: true, ...tv("80") },
      { label: "Just One More Episode", ...tv("18") },
      { label: "Other Worlds", ...tv("10765") },
      { label: "Mysteries to Unravel", ...tv("9648") },
      { label: "Spotlight · Action & Adventure", spotlight: true, ...tv("10759") },
      { label: "Real Stories", ...tv("99") },
      { label: "Power Plays", ...tv("10768") },
      { label: "Family Watch", ...tv("10751") },
      { label: "All-Time Greats", path: "tv/top_rated", kind: "tv" },
    ],
  },
  anime: {
    hero: an("", { "vote_count.gte": 300 }),
    top10: { label: "Top 10 Anime Today", ...an("", { sort_by: "popularity.desc" }) },
    rows: [
      { label: "Classics We Grew Up With", ...an("", { "first_air_date.lte": "2009-12-31", sort_by: "vote_count.desc" }) },
      { label: "New Generation", ...an("", { "first_air_date.gte": "2020-01-01" }) },
      { label: "Spotlight · Action & Battle", spotlight: true, ...an("10759") },
      { label: "Unforgettable Anime Films", path: "discover/movie", kind: "movie", params: { with_genres: "16", with_original_language: "ja", "vote_count.gte": 200 } },
      { label: "Comedy & Slice of Life", ...an("35") },
      { label: "Spotlight · Other Worlds", spotlight: true, ...an("10765") },
      { label: "Mysteries & Mind Games", ...an("9648") },
      { label: "Heavy Hearts", ...an("18") },
      { label: "Highest Rated", ...an("", { sort_by: "vote_average.desc", "vote_count.gte": 300 }) },
    ],
  },
};
}

// Franchise rows on the Constellations page in live mode (looked up by name on TMDB).
window.VESPERA_FRANCHISES = [
  "Star Wars", "The Avengers", "Spider-Man", "X-Men", "Deadpool", "The Dark Knight", "Harry Potter", "The Lord of the Rings",
  "The Hobbit", "Fast & Furious", "Mission: Impossible", "James Bond", "Jurassic Park", "John Wick", "The Matrix", "Dune",
  "Pirates of the Caribbean", "Indiana Jones", "Back to the Future", "The Godfather", "Mad Max", "The Hunger Games",
  "Terminator", "Alien", "Planet of the Apes", "Rocky", "Creed", "The Conjuring", "Scream", "Saw", "Transformers",
  "Toy Story", "Shrek", "Despicable Me",
];

// "Browse by Network" in live mode — TMDB network ids.
window.VESPERA_NETWORKS = [
  { id: 213, name: "Netflix" }, { id: 49, name: "HBO" }, { id: 2552, name: "Apple TV+" }, { id: 1024, name: "Prime Video" },
  { id: 2739, name: "Disney+" }, { id: 453, name: "Hulu" }, { id: 88, name: "FX" }, { id: 174, name: "AMC" },
];
