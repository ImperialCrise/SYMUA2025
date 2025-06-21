import random
import heapq
import math

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
        else: # bottom
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
            if len(path) % 2 == 0: # Alternate between moving y and x
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

def find_nearest_road(grid, y, x, max_dist=5):
    height = len(grid)
    width_grid = len(grid[0])
    for dist in range(1, max_dist+1):
        for dy in range(-dist, dist+1):
            for dx in range(-dist, dist+1):
                ny, nx = y+dy, x+dx
                if 0 <= ny < height and 0 <= nx < width_grid:
                    if manhattan((y,x), (ny,nx)) == dist and grid[ny][nx] == ROAD:
                        return (ny, nx)
    return None

def add_paths(grid, points, road_width=2):
    # Using a simplified MST-like approach (Prim's or Kruskal's like)
    # This is not a strict MST but ensures connectivity
    connected = set()
    edges = []
    for i, a in enumerate(points):
        for j, b in enumerate(points):
            if i < j:
                dist = manhattan(a, b)
                edges.append((dist, a, b))
    edges.sort() # Sort by distance

    parent = {} # For disjoint set union (DSU)
    def find(u):
        while parent.get(u, u) != u:
            u = parent[u]
        return u
    def union(u, v):
        parent[find(u)] = find(v)

    for _, a, b in edges:
        if find(a) != find(b): # If not already connected
            path = expand_orthogonal_path(a, b)
            add_road(grid, path, road_width)
            union(a, b)


def add_attractions_and_queues(grid, nb_attraction=20, queue_length=4, min_dist=5):
    height = len(grid)
    width_grid = len(grid[0])
    attractions = []
    attempts = 0
    max_attempts = 1000 # Prevent infinite loop

    while len(attractions) < nb_attraction and attempts < max_attempts:
        y = random.randint(3, height-4) # Ensure not too close to border walls
        x = random.randint(3, width_grid-4)

        if grid[y][x] != EMPTY: # Must be an empty space
            attempts += 1
            continue

        # Check min distance from other attractions
        if any(distance((y,x), pos) < min_dist for pos in attractions):
            attempts += 1
            continue

        # Check if near a road (important for accessibility)
        neighbors = [(y+dy, x+dx) for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]]
        if not any(grid[ny][nx] == ROAD for ny,nx in neighbors if 0 <= ny < height and 0 <= nx < width_grid):
            attempts +=1
            continue

        grid[y][x] = ATTRACTIONS[len(attractions) % len(ATTRACTIONS)]
        attractions.append((y,x))

        # Try to place a queue
        # random.shuffle(neighbors) # Try different directions for queue
        placed_queue = False
        for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]: # Prioritize orthogonal directions
            q_coords = []
            valid = True
            for i in range(1, queue_length+1):
                ny, nx = y + dy*i, x + dx*i
                if not (0 <= ny < height and 0 <= nx < width_grid): # bounds check
                    valid = False
                    break
                if grid[ny][nx] != EMPTY: # queue must be on empty space
                    valid = False
                    break
                # Ensure queue segments are not directly adjacent to roads (except the first segment potentially)
                if i > 1: # For segments beyond the first one
                    adjacent_to_q_segment = [(ny+ady, nx+adx) for ady, adx in [(-1,0),(1,0),(0,-1),(0,1)]]
                    if any(0 <= ay < height and 0 <= ax < width_grid and grid[ay][ax] == ROAD for ay, ax in adjacent_to_q_segment):
                        valid = False
                        break
                q_coords.append((ny,nx))

            if valid:
                for (qy,qx) in q_coords:
                    grid[qy][qx] = QUEUE
                placed_queue = True
                break

        if not placed_queue: # Could not place queue, revert attraction
            grid[y][x] = EMPTY
            attractions.pop()
            attempts += 1


def fix_road_gaps(grid):
    height = len(grid)
    width_grid = len(grid[0])
    additions = 0
    for y in range(1, height-1):
        for x in range(1, width_grid-1):
            if grid[y][x] == EMPTY:
                # Check for diagonal road connections with an empty center
                # Example: R .  and  . R
                #          . R      R .
                # (y-1,x-1) (y,x) (y+1,x+1)
                # (y-1,x+1) (y,x) (y+1,x-1)
                diag_pairs = [
                    ((y-1,x-1), (y+1,x+1), (y-1,x), (y,x-1), (y+1,x), (y,x+1)), # Top-left to Bottom-right
                    ((y-1,x+1), (y+1,x-1), (y-1,x), (y,x+1), (y+1,x), (y,x-1))  # Top-right to Bottom-left
                ]
                for d1, d2, o1, o2, o3, o4 in diag_pairs:
                    if (0 <= d1[0] < height and 0 <= d1[1] < width_grid and
                        0 <= d2[0] < height and 0 <= d2[1] < width_grid and
                        grid[d1[0]][d1[1]] == ROAD and grid[d2[0]][d2[1]] == ROAD and
                        grid[o1[0]][o1[1]] == EMPTY and grid[o2[0]][o2[1]] == EMPTY):
                        # Condition to prevent filling if it blocks passage
                        # Check if the orthogonal neighbors are also empty
                        grid[y][x] = ROAD
                        additions += 1
                        break # Move to next cell
    return additions


def export_to_txt(grid, filename="park_ascii.txt"):
    with open(filename, "w") as f:
        for row in grid:
            f.write(''.join(row) + '\\n')


def generate_theme_park(width=150, height=50, entries=3, nodes=400, road_width=2, queue_length=5,  attractions=20):
    grid = generate_empty_map(width, height, margin=3)
    entries_coords = place_multiple_entries(grid, count=entries)

    internal_nodes = []
    for _ in range(nodes): # Number of random internal nodes for pathfinding
        y = random.randint(5, height-6) # margin to avoid walls
        x = random.randint(5, width-6)
        internal_nodes.append((y,x))

    all_nodes = entries_coords + internal_nodes
    add_paths(grid, all_nodes, road_width)

    add_attractions_and_queues(grid, attractions, queue_length, min_dist=6)

    # Iteratively fix road gaps until no more can be fixed
    while fix_road_gaps(grid) > 0:
        pass  # Keep calling until it returns 0

    return grid


# --- Main execution ---
WIDTH = 150
HEIGHT = 50
ENTRIES = 3
NUMBER_OF_NODES = 400 # Increased for potentially denser road network
ROAD_WIDTH = 2 # Width of the roads
QUEUE_LENGTH = 5
NUMBER_OF_ATTRACTIONS = 20

if __name__ == "__main__":
    park_map = generate_theme_park(
        WIDTH,
        HEIGHT,
        ENTRIES,
        NUMBER_OF_NODES,
        ROAD_WIDTH,
        QUEUE_LENGTH,
        NUMBER_OF_ATTRACTIONS
    )
    export_to_txt(park_map, "park_ascii.txt")
    print(f"Generated new park map and saved to park_ascii.txt")
