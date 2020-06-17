function Vector(x, y) {
    this.x = x;
    this.y = y;
}

Vector.prototype.plus = function(other) {
    return new Vector(this.x+other.x, this.y+other.y);
}

function Grid(width, height) {
    this.width = width;
    this.height = height;
    this.space = new Array(width*height);
}
Grid.prototype.isInside = function(vector) { //находится ли клетка внутри сетки
    return vector.x >= 0 && vector.x < this.width &&
        vector.y >= 0 && vector.y < this.height;
};
Grid.prototype.get = function(vector) {
    return this.space[vector.x + this.width * vector.y];
}
Grid.prototype.set = function(vector, value) {
    this.space[vector.x + this.width * vector.y] = value;
}
Grid.prototype.forEach = function(f, context) {
    for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
            let value = this.space[x + y * this.width];
            if (value != null)
                f.call(context, value, new Vector(x, y));
        }
    }
};

let directions = {
    "n":  new Vector( 0, -1),
    "ne": new Vector( 1, -1),
    "e":  new Vector( 1,  0),
    "se": new Vector( 1,  1),
    "s":  new Vector( 0,  1),
    "sw": new Vector(-1,  1),
    "w":  new Vector(-1,  0),
    "nw": new Vector(-1, -1)
};
function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function BouncingCharacter() { //куда будет двигаться персонаж
    this.direction = randomElement(directionNames);
};

BouncingCharacter.prototype.act = function(view) {
    if (view.look(this.direction) !== " ")
        this.direction = view.find(" ") || "s";
    return {type: "move", direction: this.direction};
};

let directionNames = "n ne e se s sw w nw".split(" ");

function elementFromChar(legend, ch) {
    if (ch === " ") {
        return null;
    }
    let element = new legend[ch]();
    element.originChar = ch;
    return  element;
}
function charFromElement(element) {
    if (element === null) {
        return " ";
    } else {
        return element.originChar;
    }
}

function View(world, vector) {
    this.world = world;
    this.vector = vector;
}

View.prototype.look = function(dir) {
    let goal = this.vector.plus(directions[dir]);
    if (this.world.grid.isInside(goal)) {
        return charFromElement(this.world.grid.get(goal));
    } else {
        return "#"; //условно считаем, что за границами мира везде стена - #
    }
}

View.prototype.findAll = function(character) {
    let found = [];
    for (let dir in directions) {
        if (this.look(dir) === character) {
            found.push(dir);
        }
    }
    return found;
}

View.prototype.find = function(character) {
    let found = this.findAll(character);
    if (found.length === 0) {
        return null;
    }
    return  randomElement(found);
}

function World(map, legend) {
    let grid = new Grid(map[0].length, map.length);
    this.grid = grid;
    this.legend = legend;
    map.forEach(function (line, y) {
        for (let x = 0; x < line.length; x++) {
            grid.set(new Vector(x, y), elementFromChar(legend, line[x]));
        }
    });
}

World.prototype.toString = function() {
    let output = "";
    for (let y = 0; y < this.grid.height; y++) {
        for (let x = 0; x < this.grid.width; x++) {
            let element = this.grid.get(new Vector(x, y));
            output += charFromElement(element);
        }
        output += "\n";
    }
    return output;
}

World.prototype.turn = function () {
    let acted = []; //чтобы трекать, что персонаж уже перешел на новую клетку
    this.grid.forEach(function(character, vector) {
        if (character.act && acted.indexOf(character) === -1) {
            acted.push(character);
            this.letAct(character, vector);
        }
    }, this);
}

World.prototype.letAct = function(character, vector) {
    let action = character.act(new View(this, vector));
    if (action && action.type === "move") {
        let destination = this.checkDestination(action, vector);
        if (destination && this.grid.get(destination) == null) {
            this.grid.set(vector, null);
            this.grid.get(destination, character);
        }
    }
}

World.prototype.checkDestination = function(action, vector) {
    if (directions.hasOwnProperty(action.direction)) {
        let destination = vector.plus(directions[action.direction]);
        if (this.grid.isInside(destination)) {
            return destination;
        }
    }
}

function dirPlus(dir, n) {
    let index = directionNames.indexOf(dir);
    return directionNames[(index + n + 8) % 8];
}

function WallFollower() {
    this.dir = "s";
}

WallFollower.prototype.act = function(view) {
    let start = this.dir;
    if (view.look(dirPlus(this.dir, -3)) !== " ")
        start = this.dir = dirPlus(this.dir, -2);
    while (view.look(this.dir) !== " ") {
        this.dir = dirPlus(this.dir, 1);
        if (this.dir === start) break;
    }
    return {type: "move", direction: this.dir};
};

function LifeLikeWorld(map, legend) {
    World.call(this, map, legend);
}

LifeLikeWorld.prototype = Object.create(World.prototype);

let actionTypes = Object.create(null);

LifeLikeWorld.prototype.letAct = function (character, vector) {
    let action = character.act(new View(this, vector));
    let handled = action && action.type in actionTypes && actionTypes[action.type].call(this, character, vector, action);
    if (!handled) {
        character.energy -= 0.2;
        if (character.energy <= 0) {
            this.grid.set(vector, null); //персонаж умирает и исчезает с сетки
        }
    }
}

actionTypes.grow= function (character) {
    character.energy += 0.5;
    return true;
}

actionTypes.move = function (character, vector, action) {
    let dest = this.checkDestination(action, vector);
    if (dest === null || character.energy <= 1 || this.grid.get(dest) !== null) {
        return false;
    }
    character.energy -= 1;
    this.grid.set(vector, null);
    this.grid.set(dest, character);
    return  true;
}

actionTypes.eat = function (character, vector, action) {
    let dest = this.checkDestination(action, vector);
    let victimD = dest !== null && this.grid.get(dest);
    if (!victimD && victimD.energy === null) {
        return false;
    }
    character.energy += victimD.energy;
    this.grid.set(dest, null);
    return true;
}

actionTypes.reproduce = function (character, vector, action) {
    let child = elementFromChar(this.legend, character.originChar);
    let dest = this.checkDestination(action, vector);
    if (dest === null || character.energy <= child.energy * 2 || this.grid.get(dest) !== null) {
        return false;
    }
    character.energy -= 2 * child.energy;
    this.grid.set(dest, child);
    return  true;
}

function Plant() {
    this.energy = 2 + Math.random() * 3;
}

Plant.prototype.act = function(context) {
    if (this.energy > 10) {
        let space = context.find(" ");
        if (space) {
            return {type: "reproduce", direction: space};
        }
    }
    if (this.energy < 20) {
        return {type: "grow"};
    }
}

//травоядное животное
function Herbivore() {
    this.energy = 10;
}

Herbivore.prototype.act = function(context) {
    let space = context.find(" ");
    if (this.energy >= 50 && space) {
        return {type: "reproduce", direction: space};
    }
    let plant = context.find("*");
    if (plant) {
        return {type: "eat", direction: plant};
    }
    if (space) {
        return {type: "move", direction: space};
    }
}
/* Проблемы травоядного, которые решились в умном травоядном: простые травоядные жадные – поедают каждое растение,
которое находят, пока полностью не уничтожат всю растительность.
Во-вторых, их случайное движение заставляет их болтаться неэффективно и помирать с голоду,
если рядом не окажется растений. Слишком быстро размножаются,
что делает циклы от изобилия к голоду слишком быстрыми.*/

function SmartHerbivore(){
    this.energy = 20;
    this.direction = "n";
}

SmartHerbivore.prototype.act = function (context) {
    let space = context.find(" ");
    let plants = context.findAll("*");
    if (this.energy > 50 && space) {
        return {type: "reproduce", direction: space};
    }
    if (plants.length > 1) {
        return {type: "eat", direction: randomElement(plants)};
    }
    if (context.look(this.direction) !== " " && space) {
        this.direction = space;
    }
    return {type: "move", direction: this.direction};
}

//Хищник
function Predator() {
    this.energy = 50 ;
}

Predator.prototype.act = function (context) {
    let space = context.find(" ");
    let herbivore = context.find("O");
    if (this.energy > 100) {
        return {type: "reproduce", direction: space};
    }
    if (herbivore) {
        return {type: "eat", direction: herbivore};
    }
    if (space) {
        return {type: "move", direction: space};
    }
}

function Wall() {}

let valley = new LifeLikeWorld(
    ["####################################################",
        "#       O         ####         ****              ###",
        "#   *  @  ##                 ########    @  OO    ##",
        "#   *    ##        O O                 ****       *#",
        "#       ##*                        ##########     *#",
        "#      ##***  *         ****                     **#",
        "#* **  #  *  ***      #########                  **#",
        "#* **  #      *               #   *              **#",
        "#     ##              #   O   #  ***          ######",
        "#*          O @       #       #   *        O  #    #",
        "#*                    #  ######                 ** #",
        "###          ****          ***                  ** #",
        "#       O                        @         O       #",
        "#   *     ##  ##  ##  ##               ###      *  #",
        "#   **         #              *       #####  O     #",
        "##  **  O   O  #  #    ***  ***        ###      ** #",
        "###               #   *****                    ****#",
        "####################################################"],
    {"#": Wall,
        "@": Predator,
        "O": SmartHerbivore,
        "*": Plant}
);
animateWorld(valley);










