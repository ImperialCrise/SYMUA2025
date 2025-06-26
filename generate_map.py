import random
import math
import sys

WALL = ''
EMPTY = ' '
ENTRANCE = 'E'
ATTRACTIONS = ['A']
QUEUE = '#'
ROAD = '.'

def manhattan(a, b):
    return abs(a[0]-b[0]) + abs(a[1]-b[1])

def distance(a, b):
    return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)

def generate_empty_map(width, height, margin=3):
    grid = [[EMPTY for _ in range(width)] for _ in range(height)]
    for x in range(width):
        grid[0][x] = WALL
        grid[-1][x] = WALL
    for y in range(height):
        grid[y][0] = WALL
        grid[y][-1] = WALL
    for y in range(margin):
        for x in range(width):
            grid[y][x] = WALL
            grid[height-1 - y][x] = WALL
    for x in range(margin):
        for y in range(height):
            grid[y][x] = WALL
            grid[y][width-1 - x] = WALL
    return grid

def place_multiple_entries(grid, count=3):
    height = len(grid)
    width = len(grid[0])
    entries = []
    margin = 3
    sides = ['left', 'right', 'top', 'bottom']
    for _ in range(count):
        side = random.choice(sides)
        if side == 'left':
            y = random.randint(margin, height - margin - 1)
            x = margin
        elif side == 'right':
            y = random.randint(margin, height - margin - 1)
            x = width - margin - 1
        elif side == 'top':
            x = random.randint(margin, width - margin - 1)
            y = margin
        else:
            x = random.randint(margin, width - margin - 1)
            y = height - margin - 1
        grid[y][x] = ENTRANCE
        entries.append((y, x))
    return entries

def expand_orthogonal_path(a, b):
    y1, x1 = a
    y2, x2 = b
    path = []
    cy, cx = y1, x1
    while (cy, cx) != (y2, x2):
        if cy != y2 and cx != x2:
            if len(path) % 2 == 0:
                cy += 1 if cy < y2 else -1
            else:
                cx += 1 if cx < x2 else -1
            path.append((cy, cx))
        elif cy != y2:
            cy += 1 if cy < y2 else -1
            path.append((cy, cx))
        elif cx != x2:
            cx += 1 if cx < x2 else -1
            path.append((cy, cx))
    return path

def add_road(grid, path, width=2):
    height = len(grid)
    width_grid = len(grid[0])
    for (y, x) in path:
        for dy in range(-(width//2), width - (width//2)):
            for dx in range(-(width//2), width - (width//2)):
                ny, nx = y+dy, x+dx
                if 0 <= ny < height and 0 <= nx < width_grid:
                    if grid[ny][nx] == EMPTY:
                        grid[ny][nx] = ROAD

def add_paths(grid, points, road_width=2):
    edges = []
    parent = {}
    def find(u):
        while parent.get(u, u) != u:
            u = parent[u]
        return u
    def union(u, v):
        parent[find(u)] = find(v)
    for i, a in enumerate(points):
        for j, b in enumerate(points):
            if i < j:
                dist = manhattan(a, b)
                edges.append((dist, a, b))
    edges.sort()
    for _, a, b in edges:
        if find(a) != find(b):
            path = expand_orthogonal_path(a, b)
            add_road(grid, path, road_width)
            union(a, b)

def connect_nearby_roads(grid, max_dist=10, road_width=2):
    height = len(grid)
    width = len(grid[0])
    roads = [(y, x) for y in range(height) for x in range(width) if grid[y][x] == ROAD]
    connected = set()

    for i in range(len(roads)):
        y1, x1 = roads[i]
        for j in range(i + 1, len(roads)):
            y2, x2 = roads[j]
            if (y1, x1) in connected and (y2, x2) in connected:
                continue
            d = manhattan((y1, x1), (y2, x2))
            if 1 < d <= max_dist:
                path = expand_orthogonal_path((y1, x1), (y2, x2))
                if all(grid[y][x] == EMPTY for y, x in path):
                    add_road(grid, path, road_width)
                    connected.add((y1, x1))
                    connected.add((y2, x2))

def add_attractions_and_queues(grid, nb_attraction=20, queue_length=4, min_dist=5):
    height = len(grid)
    width_grid = len(grid[0])
    attractions = []
    attempts = 0
    max_attempts = 1000

    while len(attractions) < nb_attraction and attempts < max_attempts:
        y = random.randint(3, height - 4)
        x = random.randint(3, width_grid - 4)
        directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        random.shuffle(directions)

        for dy, dx in directions:
            q_coords = []
            valid = True

            for i in range(queue_length):
                ny = y + dy * i
                nx = x + dx * i
                if not (0 <= ny < height and 0 <= nx < width_grid) or grid[ny][nx] != EMPTY:
                    valid = False
                    break
                q_coords.append((ny, nx))

            if not valid:
                continue

            start_y, start_x = q_coords[0]
            adjacent_to_road = any(
                0 <= start_y+ady < height and 0 <= start_x+adx < width_grid and grid[start_y+ady][start_x+adx] == ROAD
                for ady, adx in directions
            )
            if not adjacent_to_road:
                continue

            isolated = True
            for qy, qx in q_coords[1:]:
                if any(
                    0 <= qy+dy < height and 0 <= qx+dx < width_grid and grid[qy+dy][qx+dx] == ROAD
                    for dy, dx in directions
                ):
                    isolated = False
                    break
            if not isolated:
                continue

            attraction_pos = q_coords[-1]
            if any(distance(attraction_pos, pos) < min_dist for pos in attractions):
                continue

            for qy, qx in q_coords:
                grid[qy][qx] = QUEUE
            ay, ax = attraction_pos
            grid[ay][ax] = ATTRACTIONS[len(attractions) % len(ATTRACTIONS)]
            attractions.append((ay, ax))
            break

        attempts += 1

def fix_road_gaps(grid):
    height = len(grid)
    width_grid = len(grid[0])
    additions = 0
    for y in range(1, height-1):
        for x in range(1, width_grid-1):
            if grid[y][x] == EMPTY:
                diag_pairs = [
                    ((y-1,x-1), (y+1,x+1), (y-1,x), (y,x-1), (y+1,x), (y,x+1)),
                    ((y-1,x+1), (y+1,x-1), (y-1,x), (y,x+1), (y+1,x), (y,x-1))
                ]
                for d1, d2, o1, o2, o3, o4 in diag_pairs:
                    if (0 <= d1[0] < height and 0 <= d1[1] < width_grid and
                        0 <= d2[0] < height and 0 <= d2[1] < width_grid and
                        grid[d1[0]][d1[1]] == ROAD and grid[d2[0]][d2[1]] == ROAD and
                        grid[o1[0]][o1[1]] == EMPTY and grid[o2[0]][o2[1]] == EMPTY):
                        grid[y][x] = ROAD
                        additions += 1
                        break
    return additions

def export_to_txt(grid, filename="park_ascii.txt"):
    with open(filename, "w") as f:
        for row in grid:
            f.write(''.join(row) + '\n')

def generate_theme_park(width=150, height=50, entries=3, nodes=400, road_width=2, queue_length=5, attractions=20):
    grid = generate_empty_map(width, height, margin=3)
    entries = place_multiple_entries(grid, count=entries)
    internal_nodes = [(random.randint(5, height-6), random.randint(5, width-6)) for _ in range(nodes)]
    all_nodes = entries + internal_nodes
    add_paths(grid, all_nodes, road_width)
    connect_nearby_roads(grid, max_dist=8, road_width=road_width)
    add_attractions_and_queues(grid, attractions, queue_length, min_dist=6)
    while fix_road_gaps(grid) > 0:
        pass
    return grid



WIDTH = int(sys.argv[1])
HEIGHT = int(sys.argv[2])
ENTRIES = int(sys.argv[3])
NUMBER_OF_NODES = int(sys.argv[4])
ROAD_WIDTH = int(sys.argv[5])
QUEUE_LENGTH = int(sys.argv[6])
NUMBER_OF_ATTRACTIONS = int(sys.argv[7])


if __name__ == "__main__":
    park = generate_theme_park(
        WIDTH,
        HEIGHT,
        ENTRIES,
        NUMBER_OF_NODES,
        ROAD_WIDTH,
        QUEUE_LENGTH,
        NUMBER_OF_ATTRACTIONS,
    )
    print(">> Writing file", flush=True)
    export_to_txt(park, "park_ascii.txt")
    print(">> Done writing file", flush=True)
    print("DONE", flush=True)

