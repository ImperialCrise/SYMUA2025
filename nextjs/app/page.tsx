"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Play, Pause, RotateCcw, Settings, Eye, EyeOff } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

// Types
interface Visitor {
  id: number
  x: number
  y: number
  age: number
  isFamily: boolean
  preferredGenre: string
  satisfaction: number
  state: "moving" | "inQueue" | "riding" | "leaving"
  currentAttraction: number | null
  path: { x: number; y: number }[]
  speed: number
  waitTime: number // Temps passé dans l'attraction ou dans la file pour la logique actuelle
  timeSpentInQueue: number // Nouveau champ pour le temps d'attente spécifique à la file
  pastAttractions: number[]
  totalWaitTime: number
  attractionsVisited: number
  timeInTransit: number
  queuePosition: number // Position dans la queue (0 = plus proche de l'attraction)
}

interface Attraction {
  id: number
  x: number
  y: number
  waitTime: number
  tags: string[]
  capacity: number
  popularity: number
  visitorsInside: number
  visitorsInQueue: number
  occupancyRate: number
  averageRemainingTime: number
}

interface ParkCell {
  type: "wall" | "empty" | "entrance" | "attraction" | "queue" | "road"
  attractionId?: number
}

interface StatsHistory {
  time: number
  totalPresents: number
  inAttractions: number
  inQueues: number
  moving: number
  averageSatisfaction: number
  satisfactionMin: number
  satisfactionMax: number
}

const ATTRACTION_TAGS = ["RollerCoaster", "Famille", "Sensation", "Enfant", "Horreur", "Spectacle"]

// Constantes du script Python
const WALL = ""
const EMPTY = " "
const ENTRANCE = "E"
const ATTRACTIONS = ["A"]
const QUEUE = "#"
const ROAD = "."

export default function ThemeParkSimulator() {
  const [park, setPark] = useState<ParkCell[][]>([])
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [attractions, setAttractions] = useState<Attraction[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [statsHistory, setStatsHistory] = useState<StatsHistory[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [stats, setStats] = useState({
    totalEntered: 0,
    totalExited: 0,
    inAttractions: 0,
    inQueues: 0,
    moving: 0,
    averageSatisfaction: 0,
  })

  // Paramètres de simulation avec densité et vitesse au maximum
  const [params, setParams] = useState({
    width: 100,
    height: 55,
    entries: 3,
    numberOfNodes: 439,
    roadWidth: 2,
    queueLength: 5,
    numberOfAttractions: 20,
    spawnRate: 0.5, // Densité au maximum
    speed: 50, // Réduire de 150 à 50 pour que les visiteurs passent plus de temps en transit
    initialSatisfaction: 50, // Nouveau paramètre
    satisfactionGainPerAttraction: 15, // Nouveau paramètre
    satisfactionLossPerWaitTime: 0.5, // Nouveau paramètre
    satisfactionLossPerCurrentWait: 0.3, // Nouveau paramètre
    satisfactionMin: 10, // Nouveau paramètre - seuil minimum
    satisfactionMax: 90, // Nouveau paramètre - seuil maximum
    visitorsPerQueueCell: 2, // Nouveau paramètre
    satisfactionEnabled: true, // Nouveau paramètre
    maxQueueWaitTime: 20, // Nouveau paramètre pour le temps d'attente max en file
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const visitorIdRef = useRef(0)
  const tickRef = useRef(0)

  // Pagination des graphiques
  const [currentChart, setCurrentChart] = useState<"stats" | "satisfaction">("stats")

  // Fonctions du script Python traduites en JavaScript

  const manhattan = (a: [number, number], b: [number, number]): number => {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])
  }

  const distance = (a: [number, number], b: [number, number]): number => {
    return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2))
  }

  const generateEmptyMap = (width: number, height: number, margin = 3): string[][] => {
    const grid: string[][] = Array(height)
      .fill(null)
      .map(() => Array(width).fill(EMPTY))

    for (let x = 0; x < width; x++) {
      grid[0][x] = WALL
      grid[height - 1][x] = WALL
    }
    for (let y = 0; y < height; y++) {
      grid[y][0] = WALL
      grid[y][width - 1] = WALL
    }
    for (let y = 0; y < margin; y++) {
      for (let x = 0; x < width; x++) {
        grid[y][x] = WALL
        grid[height - 1 - y][x] = WALL
      }
    }
    for (let x = 0; x < margin; x++) {
      for (let y = 0; y < height; y++) {
        grid[y][x] = WALL
        grid[y][width - 1 - x] = WALL
      }
    }
    return grid
  }

  const placeMultipleEntries = (grid: string[][], count = 3): [number, number][] => {
    const height = grid.length
    const width = grid[0].length
    const entries: [number, number][] = []
    const margin = 3
    const sides = ["left", "right", "top", "bottom"]

    for (let i = 0; i < count; i++) {
      const side = sides[Math.floor(Math.random() * sides.length)]
      let x: number, y: number

      if (side === "left") {
        y = Math.floor(Math.random() * (height - 2 * margin)) + margin
        x = margin
      } else if (side === "right") {
        y = Math.floor(Math.random() * (height - 2 * margin)) + margin
        x = width - margin - 1
      } else if (side === "top") {
        x = Math.floor(Math.random() * (width - 2 * margin)) + margin
        y = margin
      } else {
        x = Math.floor(Math.random() * (width - 2 * margin)) + margin
        y = height - margin - 1
      }

      grid[y][x] = ENTRANCE
      entries.push([y, x])
    }
    return entries
  }

  const expandOrthogonalPath = (a: [number, number], b: [number, number]): [number, number][] => {
    const [y1, x1] = a
    const [y2, x2] = b
    const path: [number, number][] = []
    let cy = y1,
      cx = x1

    while (cy !== y2 || cx !== x2) {
      if (cy !== y2 && cx !== x2) {
        if (path.length % 2 === 0) {
          cy += cy < y2 ? 1 : -1
        } else {
          cx += cx < x2 ? 1 : -1
        }
        path.push([cy, cx])
      } else if (cy !== y2) {
        cy += cy < y2 ? 1 : -1
        path.push([cy, cx])
      } else if (cx !== x2) {
        cx += cx < x2 ? 1 : -1
        path.push([cy, cx])
      }
    }
    return path
  }

  const addRoad = (grid: string[][], path: [number, number][], roadWidth = 2): void => {
    const height = grid.length
    const width = grid[0].length

    for (const [y, x] of path) {
      for (let dy = -Math.floor(roadWidth / 2); dy < roadWidth - Math.floor(roadWidth / 2); dy++) {
        for (let dx = -Math.floor(roadWidth / 2); dx < roadWidth - Math.floor(roadWidth / 2); dx++) {
          const ny = y + dy
          const nx = x + dx
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            if (grid[ny][nx] === EMPTY) {
              grid[ny][nx] = ROAD
            }
          }
        }
      }
    }
  }

  const addPaths = (grid: string[][], points: [number, number][], roadWidth = 2): void => {
    const edges: [number, [number, number], [number, number]][] = []
    const parent: Map<string, string> = new Map()

    const find = (u: [number, number]): string => {
      const key = `${u[0]},${u[1]}`
      if (!parent.has(key)) {
        parent.set(key, key)
        return key
      }
      let current = parent.get(key)!
      while (parent.get(current) !== current) {
        current = parent.get(current)!
      }
      return current
    }

    const union = (u: [number, number], v: [number, number]): void => {
      const rootU = find(u)
      const rootV = find(v)
      parent.set(rootU, rootV)
    }

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dist = manhattan(points[i], points[j])
        edges.push([dist, points[i], points[j]])
      }
    }

    edges.sort((a, b) => a[0] - b[0])

    for (const [_, a, b] of edges) {
      if (find(a) !== find(b)) {
        const path = expandOrthogonalPath(a, b)
        addRoad(grid, path, roadWidth)
        union(a, b)
      }
    }
  }

  const connectNearbyRoads = (grid: string[][], maxDist = 10, roadWidth = 2): void => {
    const height = grid.length
    const width = grid[0].length
    const roads: [number, number][] = []

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] === ROAD) {
          roads.push([y, x])
        }
      }
    }

    const connected = new Set<string>()

    for (let i = 0; i < roads.length; i++) {
      const [y1, x1] = roads[i]
      for (let j = i + 1; j < roads.length; j++) {
        const [y2, x2] = roads[j]
        if (connected.has(`${y1},${x1}`) && connected.has(`${y2},${x2}`)) {
          continue
        }
        const d = manhattan([y1, x1], [y2, x2])
        if (d > 1 && d <= maxDist) {
          const path = expandOrthogonalPath([y1, x1], [y2, x2])
          if (path.every(([y, x]) => grid[y][x] === EMPTY)) {
            addRoad(grid, path, roadWidth)
            connected.add(`${y1},${x1}`)
            connected.add(`${y2},${x2}`)
          }
        }
      }
    }
  }

  const addAttractionsAndQueues = (
    grid: string[][],
    nbAttraction = 20,
    queueLength = 4,
    minDist = 5,
  ): [number, number][] => {
    const height = grid.length
    const width = grid[0].length
    const attractions: [number, number][] = []
    let attempts = 0
    const maxAttempts = 1000

    while (attractions.length < nbAttraction && attempts < maxAttempts) {
      const y = Math.floor(Math.random() * (height - 8)) + 3
      const x = Math.floor(Math.random() * (width - 8)) + 3
      const directions: [number, number][] = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]

      // Shuffle directions
      for (let i = directions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[directions[i], directions[j]] = [directions[j], directions[i]]
      }

      for (const [dy, dx] of directions) {
        const qCoords: [number, number][] = []
        let valid = true

        for (let i = 0; i < queueLength; i++) {
          const ny = y + dy * i
          const nx = x + dx * i
          if (!(ny >= 0 && ny < height && nx >= 0 && nx < width) || grid[ny][nx] !== EMPTY) {
            valid = false
            break
          }
          qCoords.push([ny, nx])
        }

        if (!valid) continue

        const [startY, startX] = qCoords[0]
        const adjacentToRoad = directions.some(([ady, adx]) => {
          const checkY = startY + ady
          const checkX = startX + adx
          return checkY >= 0 && checkY < height && checkX >= 0 && checkX < width && grid[checkY][checkX] === ROAD
        })

        if (!adjacentToRoad) continue

        let isolated = true
        for (let i = 1; i < qCoords.length; i++) {
          const [qy, qx] = qCoords[i]
          if (
            directions.some(([dy, dx]) => {
              const checkY = qy + dy
              const checkX = qx + dx
              return checkY >= 0 && checkY < height && checkX >= 0 && checkX < width && grid[checkY][checkX] === ROAD
            })
          ) {
            isolated = false
            break
          }
        }

        if (!isolated) continue

        const attractionPos = qCoords[qCoords.length - 1]
        if (attractions.some((pos) => distance(attractionPos, pos) < minDist)) {
          continue
        }

        for (const [qy, qx] of qCoords) {
          grid[qy][qx] = QUEUE
        }
        const [ay, ax] = attractionPos
        grid[ay][ax] = ATTRACTIONS[attractions.length % ATTRACTIONS.length]
        attractions.push([ay, ax])
        break
      }
      attempts++
    }
    return attractions
  }

  const fixRoadGaps = (grid: string[][]): number => {
    const height = grid.length
    const width = grid[0].length
    let additions = 0

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (grid[y][x] === EMPTY) {
          const diagPairs = [
            [
              [y - 1, x - 1],
              [y + 1, x + 1],
              [y - 1, x],
              [y, x - 1],
              [y + 1, x],
              [y, x + 1],
            ],
            [
              [y - 1, x + 1],
              [y + 1, x - 1],
              [y - 1, x],
              [y, x + 1],
              [y + 1, x],
              [y, x - 1],
            ],
          ]

          for (const [d1, d2, o1, o2, o3, o4] of diagPairs) {
            const [d1y, d1x] = d1 as [number, number]
            const [d2y, d2x] = d2 as [number, number]
            const [o1y, o1x] = o1 as [number, number]
            const [o2y, o2x] = o2 as [number, number]

            if (
              d1y >= 0 &&
              d1y < height &&
              d1x >= 0 &&
              d1x < width &&
              d2y >= 0 &&
              d2y < height &&
              d2x >= 0 &&
              d1x < width &&
              grid[d1y][d1x] === ROAD &&
              grid[d2y][d2x] === ROAD &&
              grid[o1y][o1x] === EMPTY &&
              grid[o2y][o2x] === EMPTY
            ) {
              grid[y][x] = ROAD
              additions++
              break
            }
          }
        }
      }
    }
    return additions
  }

  const generateThemePark = (
    width = 150,
    height = 50,
    entries = 3,
    nodes = 400,
    roadWidth = 2,
    queueLength = 5,
    attractionsCount = 20,
  ): string[][] => {
    const grid = generateEmptyMap(width, height, 3)
    const entriesPos = placeMultipleEntries(grid, entries)
    const internalNodes: [number, number][] = []

    for (let i = 0; i < nodes; i++) {
      const y = Math.floor(Math.random() * (height - 12)) + 5
      const x = Math.floor(Math.random() * (width - 12)) + 5
      internalNodes.push([y, x])
    }

    const allNodes = [...entriesPos, ...internalNodes]
    addPaths(grid, allNodes, roadWidth)
    connectNearbyRoads(grid, 8, roadWidth)
    addAttractionsAndQueues(grid, attractionsCount, queueLength, 6)

    while (fixRoadGaps(grid) > 0) {
      // Continue fixing gaps
    }

    return grid
  }

  // Conversion de la grille Python vers notre format
  const convertPythonGridToPark = (pythonGrid: string[][]): { park: ParkCell[][]; attractions: Attraction[] } => {
    const height = pythonGrid.length
    const width = pythonGrid[0].length
    const newPark: ParkCell[][] = Array(height)
      .fill(null)
      .map(() =>
        Array(width)
          .fill(null)
          .map(() => ({ type: "empty" as const })),
      )
    const newAttractions: Attraction[] = []
    let attractionId = 0

    // Map pour associer les positions d'attractions aux IDs
    const attractionPositions = new Map<string, number>()

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = pythonGrid[y][x]
        switch (cell) {
          case WALL:
            newPark[y][x] = { type: "wall" }
            break
          case ROAD:
            newPark[y][x] = { type: "road" }
            break
          case ENTRANCE:
            newPark[y][x] = { type: "entrance" }
            break
          case "A":
            newPark[y][x] = { type: "attraction", attractionId }
            attractionPositions.set(`${y},${x}`, attractionId)
            newAttractions.push({
              id: attractionId,
              x,
              y,
              waitTime: Math.floor(Math.random() * 15) + 10,
              tags: [ATTRACTION_TAGS[Math.floor(Math.random() * ATTRACTION_TAGS.length)]],
              capacity: Math.floor(Math.random() * 30) + 20,
              popularity: Math.random() * 10,
              visitorsInside: 0,
              visitorsInQueue: 0,
              occupancyRate: 0,
              averageRemainingTime: 0,
            })
            attractionId++
            break
          case QUEUE:
            // Trouver l'attraction associée à cette queue
            let queueAttractionId = -1
            const directions = [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
            ]
            for (const [dy, dx] of directions) {
              const ny = y + dy
              const nx = x + dx
              if (ny >= 0 && ny < height && nx >= 0 && nx < width && pythonGrid[ny][nx] === "A") {
                const key = `${ny},${nx}`
                if (attractionPositions.has(key)) {
                  queueAttractionId = attractionPositions.get(key)!
                  break
                }
              }
            }
            newPark[y][x] = { type: "queue", attractionId: queueAttractionId >= 0 ? queueAttractionId : undefined }
            break
          default:
            newPark[y][x] = { type: "empty" }
        }
      }
    }

    return { park: newPark, attractions: newAttractions }
  }

  // Génération du parc avec le script Python exact
  const generatePark = () => {
    const { width, height, entries, numberOfNodes, roadWidth, queueLength, numberOfAttractions } = params

    const pythonGrid = generateThemePark(
      width,
      height,
      entries,
      numberOfNodes,
      roadWidth,
      queueLength,
      numberOfAttractions,
    )

    const { park: newPark, attractions: newAttractions } = convertPythonGridToPark(pythonGrid)

    setPark(newPark)
    setAttractions(newAttractions)
    setVisitors([])
    setStats({ totalEntered: 0, totalExited: 0, inAttractions: 0, inQueues: 0, moving: 0, averageSatisfaction: 0 })
    setStatsHistory([])
    visitorIdRef.current = 0
    tickRef.current = 0
  }

  // Pathfinding
  const findPath = (start: { x: number; y: number }, end: { x: number; y: number }): { x: number; y: number }[] => {
    if (!park.length) return []

    const width = park[0].length
    const height = park.length
    const visited = new Set<string>()
    const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [{ x: start.x, y: start.y, path: [] }]

    while (queue.length > 0) {
      const current = queue.shift()!
      const key = `${current.x},${current.y}`

      if (visited.has(key)) continue
      visited.add(key)

      if (current.x === end.x && current.y === end.y) {
        return current.path
      }

      const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
      ]

      for (const dir of directions) {
        const nx = current.x + dir.dx
        const ny = current.y + dir.dy

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const cell = park[ny][nx]
          if (["road", "entrance", "queue"].includes(cell.type) && !visited.has(`${nx},${ny}`)) {
            queue.push({
              x: nx,
              y: ny,
              path: [...current.path, { x: nx, y: ny }],
            })
          }
        }
      }
    }

    return []
  }

  // Calcul de la satisfaction
  const calculateSatisfaction = (visitor: Visitor): number => {
    let satisfaction = params.initialSatisfaction // Utiliser le paramètre

    // Pénalité pour le temps d'attente total (incluant transit)
    satisfaction -= visitor.totalWaitTime * params.satisfactionLossPerWaitTime

    // Pénalité pour le temps en transit vers l'attraction actuelle
    satisfaction -= visitor.timeInTransit * (params.satisfactionLossPerWaitTime * 0.3) // Moins pénalisant qu'en file

    // Bonus pour les attractions visitées
    satisfaction += visitor.attractionsVisited * params.satisfactionGainPerAttraction

    // Bonus pour les attractions populaires visitées
    for (const attractionId of visitor.pastAttractions) {
      const attraction = attractions.find((a) => a.id === attractionId)
      if (attraction) {
        satisfaction += attraction.popularity * 2
      }
    }

    // Pénalité si en attente actuellement
    if (visitor.state === "inQueue" || visitor.state === "riding") {
      satisfaction -= visitor.waitTime * params.satisfactionLossPerCurrentWait
    }

    // Bonus familial
    if (visitor.isFamily) {
      satisfaction += 10
    }

    return Math.max(0, Math.min(100, satisfaction))
  }

  // Spawn des visiteurs
  const spawnVisitors = () => {
    if (Math.random() < params.spawnRate) {
      const entrances = []
      for (let y = 0; y < park.length; y++) {
        for (let x = 0; x < park[0].length; x++) {
          if (park[y][x].type === "entrance") {
            entrances.push({ x, y })
          }
        }
      }

      if (entrances.length > 0) {
        const entrance = entrances[Math.floor(Math.random() * entrances.length)]
        const isFamily = Math.random() < 0.4

        const newVisitor: Visitor = {
          id: visitorIdRef.current++,
          x: entrance.x,
          y: entrance.y,
          age: Math.floor(Math.random() * 50) + 10,
          isFamily,
          preferredGenre: ATTRACTION_TAGS[Math.floor(Math.random() * ATTRACTION_TAGS.length)],
          satisfaction: params.initialSatisfaction,
          state: "moving",
          currentAttraction: null,
          path: [],
          speed: isFamily ? 1 + Math.random() : 2 + Math.random() * 2,
          waitTime: 0,
          timeSpentInQueue: 0, // Initialisation du nouveau champ
          pastAttractions: [],
          totalWaitTime: 0,
          attractionsVisited: 0,
          timeInTransit: 0,
          queuePosition: -1, // -1 = pas en queue
        }

        // DISPERSER le visiteur dès le spawn - ROUTES PROCHES DES ENTRÉES
        const nearbyRoads: { x: number; y: number; distance: number }[] = []
        
        // Trouver des routes dans un rayon de 15 cases des entrées (plus sûr)
        for (let y = 0; y < park.length; y++) {
          for (let x = 0; x < park[0].length; x++) {
            if (park[y][x].type === "road") {
              // Calculer distance à l'entrée la plus proche
              let minDistanceToEntrance = Infinity
              for (let ey = 0; ey < park.length; ey++) {
                for (let ex = 0; ex < park[0].length; ex++) {
                  if (park[ey][ex].type === "entrance") {
                    const dist = Math.abs(x - ex) + Math.abs(y - ey)
                    minDistanceToEntrance = Math.min(minDistanceToEntrance, dist)
                  }
                }
              }
              
              // Seulement les routes relativement proches des entrées
              if (minDistanceToEntrance <= 15) {
                nearbyRoads.push({ x, y, distance: minDistanceToEntrance })
              }
            }
          }
        }
        
        // Téléporter vers une route proche d'une entrée (plus sûr)
        if (nearbyRoads.length > 0) {
          // Favoriser les routes un peu éloignées des entrées (pas trop près = embouteillages)
          const suitableRoads = nearbyRoads.filter(r => r.distance >= 3 && r.distance <= 10)
          const targetRoads = suitableRoads.length > 0 ? suitableRoads : nearbyRoads
          
          const randomRoad = targetRoads[Math.floor(Math.random() * targetRoads.length)]
          newVisitor.x = randomRoad.x
          newVisitor.y = randomRoad.y
        }

        // Utiliser le système de scoring intelligent dès le spawn
        if (attractions.length > 0) {
          const availableAttractions = attractions.filter(
            (a) => !newVisitor.pastAttractions.includes(a.id)
          )
          
          if (availableAttractions.length > 0) {
            const scoredAttractions = availableAttractions
              .map((a) => {
                const distance = Math.abs(a.x - newVisitor.x) + Math.abs(a.y - newVisitor.y)
                
                // Compter les visiteurs qui ciblent déjà cette attraction
                const visitorsTargeting = 0 // Simplification temporaire
                
                // Score de charge (moins il y a de monde, mieux c'est)
                const loadScore = Math.max(0.1, 1 / (visitorsTargeting + 1))
                
                // Score de distance (plus proche = mieux)
                const distanceScore = Math.max(0.1, 100 / (distance + 1))
                
                // Bonus pour les préférences
                const preferenceBonus = a.tags.includes(newVisitor.preferredGenre) ? 2 : 1
                
                // Score final combiné
                const finalScore = (loadScore * 3 + distanceScore) * preferenceBonus
                
                return {
                  attraction: a,
                  score: finalScore,
                  distance,
                  visitorsTargeting
                }
              })
              .sort((a, b) => b.score - a.score)
            
            // Sélection pondérée aléatoire des meilleures attractions
            const topAttractions = scoredAttractions.slice(0, Math.min(5, scoredAttractions.length))
            const weights = [0.3, 0.25, 0.2, 0.15, 0.1] // Distribution plus équitable
            
            let randomValue = Math.random()
            let selectedAttraction = topAttractions[0].attraction
            
            for (let i = 0; i < topAttractions.length; i++) {
              if (randomValue < weights[i]) {
                selectedAttraction = topAttractions[i].attraction
                break
              }
              randomValue -= weights[i]
            }
            
            newVisitor.currentAttraction = selectedAttraction.id
          }
        }



        setVisitors((prev) => [...prev, newVisitor])
        setStats((prev) => ({ ...prev, totalEntered: prev.totalEntered + 1 }))
      }
    }
  }

  // Nouveau système de queue amélioré
  const getQueueCellsForAttraction = (attractionId: number): { x: number; y: number }[] => {
    const queueCells: { x: number; y: number }[] = []
    const attraction = attractions.find((a) => a.id === attractionId)
    if (!attraction) return queueCells

    // Trouver toutes les cases de queue pour cette attraction
    for (let y = 0; y < park.length; y++) {
      for (let x = 0; x < park[0].length; x++) {
        if (park[y][x].type === "queue" && park[y][x].attractionId === attractionId) {
          queueCells.push({ x, y })
        }
      }
    }

    // Trier les cases par distance à l'attraction (plus loin = entrée queue, plus proche = sortie queue)
    queueCells.sort((a, b) => {
      const distA = Math.abs(a.x - attraction.x) + Math.abs(a.y - attraction.y)
      const distB = Math.abs(b.x - attraction.x) + Math.abs(b.y - attraction.y)
      return distB - distA  // Plus loin en premier
    })

    return queueCells
  }

  // Obtenir la prochaine position disponible dans la queue
  const getNextQueuePosition = (attractionId: number, allVisitors: Visitor[]): { position: number; cell: { x: number; y: number } } | null => {
    const queueCells = getQueueCellsForAttraction(attractionId)
    if (queueCells.length === 0) return null

    // Compter les visiteurs par position dans la queue
    const occupiedPositions = new Set<number>()
    allVisitors
      .filter(v => v.currentAttraction === attractionId && v.state === "inQueue")
      .forEach(v => occupiedPositions.add(v.queuePosition))

    // Trouver la première position libre (en partant de la fin de la queue)
    for (let position = queueCells.length - 1; position >= 0; position--) {
      if (!occupiedPositions.has(position)) {
        return { position, cell: queueCells[position] }
      }
    }

    return null // Queue pleine
  }

  // Faire avancer tous les visiteurs dans une queue
  const advanceQueueForAttraction = (attractionId: number, allVisitors: Visitor[]): void => {
    const visitorsInQueue = allVisitors
      .filter(v => v.currentAttraction === attractionId && v.state === "inQueue")
      .sort((a, b) => a.queuePosition - b.queuePosition) // Trier par position (0 = devant)

    const queueCells = getQueueCellsForAttraction(attractionId)
    
    // Mettre à jour les positions physiques selon la position dans la queue
    visitorsInQueue.forEach(visitor => {
      if (visitor.queuePosition >= 0 && visitor.queuePosition < queueCells.length) {
        const targetCell = queueCells[visitor.queuePosition]
        visitor.x = targetCell.x
        visitor.y = targetCell.y
      }
    })
  }

  // Mise à jour de la simulation
  const updateSimulation = () => {
    const attractionsAdmittedThisTick = new Set<number>(); // Track admissions per tick

    setVisitors((prevVisitors) => {
      // Première passe : supprimer immédiatement les visiteurs en leaving qui sont sur une entrée
      let filteredVisitors = prevVisitors.filter((visitor) => {
        if (visitor.state === "leaving" && park[visitor.y] && park[visitor.y][visitor.x] && park[visitor.y][visitor.x].type === "entrance") {
          if (selectedAgentId === visitor.id) {
            setSelectedAgentId(null)
          }
          return false
        }
        return true
      })

      const updatedVisitors = filteredVisitors.map((visitor) => {
        switch (visitor.state) {
          case "riding":
            visitor.waitTime++
            visitor.totalWaitTime++
            const attraction = attractions.find((a) => a.id === visitor.currentAttraction)
            if (attraction && visitor.waitTime >= attraction.waitTime) {
                          visitor.pastAttractions.push(visitor.currentAttraction!)
            visitor.attractionsVisited++
            visitor.currentAttraction = null
              visitor.waitTime = 0
              visitor.timeInTransit = 0
              visitor.path = []
              visitor.queuePosition = -1 // Reset position queue
              
              // DÉCISION: Continuer ou quitter le parc (seulement si satisfaction activée)
              const currentSatisfaction = calculateSatisfaction(visitor)
              const shouldLeave = params.satisfactionEnabled && (
                currentSatisfaction <= params.satisfactionMin || // Pas satisfait
                currentSatisfaction >= params.satisfactionMax    // Très satisfait
              )
              
              if (shouldLeave) {
                visitor.state = "leaving"
              } else {
                visitor.state = "moving"
              }
              
              // IMPORTANT: Téléporter le visiteur vers une route accessible après la sortie
              const nearbyRoads: { x: number; y: number; distance: number }[] = []
              
              // Chercher toutes les routes dans un rayon de 10 cases
              for (let dy = -10; dy <= 10; dy++) {
                for (let dx = -10; dx <= 10; dx++) {
                  const newX = attraction.x + dx
                  const newY = attraction.y + dy
                  
                  if (newX >= 0 && newX < park[0].length && newY >= 0 && newY < park.length) {
                    if (park[newY][newX].type === "road" || park[newY][newX].type === "entrance") {
                      const distance = Math.abs(dx) + Math.abs(dy)
                      nearbyRoads.push({ x: newX, y: newY, distance })
                    }
                  }
                }
              }
              
              // Téléporter vers la route la plus proche
              if (nearbyRoads.length > 0) {
                nearbyRoads.sort((a, b) => a.distance - b.distance)
                visitor.x = nearbyRoads[0].x
                visitor.y = nearbyRoads[0].y
              }
            }
            break

                    case "inQueue":
          visitor.waitTime++ // Conserver pour la satisfaction ou autres logiques basées sur le temps total d'attente
          visitor.totalWaitTime++
          visitor.timeSpentInQueue++ // Incrémenter le temps passé spécifiquement dans cette file

            const currentAttraction = attractions.find((a) => a.id === visitor.currentAttraction)
            if (currentAttraction) {
              const ridingVisitors = prevVisitors.filter(
                (v: Visitor) => v.currentAttraction === currentAttraction.id && v.state === "riding"
            ).length

              // CORRECTION: Vérifier STRICTEMENT la capacité ET la position dans la queue
              // ET maintenant aussi le temps d'attente max.
              const hasWaitedMaxTime = visitor.timeSpentInQueue >= params.maxQueueWaitTime;
              const hasCapacity = ridingVisitors < currentAttraction.capacity;
              const canAdmitNewVisitor = !attractionsAdmittedThisTick.has(currentAttraction.id);

              if (visitor.queuePosition === 0 && hasCapacity) {
                // Il y a de la place, maintenant vérifions s'il doit entrer
                if (hasWaitedMaxTime || canAdmitNewVisitor) {
                  visitor.state = "riding";
                  visitor.waitTime = 0; // Réinitialiser waitTime pour la durée de l'attraction
                  visitor.timeSpentInQueue = 0; // Réinitialiser le temps passé dans la file
                  visitor.queuePosition = -1; // Plus en queue
                  attractionsAdmittedThisTick.add(currentAttraction.id); // Marquer que l'attraction a admis qqn

                  // Téléporter le visiteur vers l'attraction
                  visitor.x = currentAttraction.x;
                  visitor.y = currentAttraction.y;
                }
                // Si hasWaitedMaxTime est faux et canAdmitNewVisitor est faux,
                // cela signifie qu'il n'a pas attendu assez longtemps ET l'attraction a déjà admis qqn ce tick.
                // Il reste donc en file, en tête.
              }
              // Si pas de capacité (hasCapacity = false) ou pas en tête de file, il ne se passe rien ici pour l'entrée.
              // Il continue d'attendre dans la file. `timeSpentInQueue` continue d'augmenter.
                
                // Téléporter le visiteur vers l'attraction
                visitor.x = currentAttraction.x
                visitor.y = currentAttraction.y
                
                // The `advanceQueueForAttraction` function, called after the main visitor update loop,
                // will handle advancing other visitors in the queue.
              }
            }
            break

          case "leaving":
            // Chercher l'entrée la plus proche pour sortir du parc
            if (visitor.path.length === 0) {
              const entrances: { x: number; y: number; distance: number }[] = []
              
              for (let y = 0; y < park.length; y++) {
                for (let x = 0; x < park[0].length; x++) {
                  if (park[y][x].type === "entrance") {
                    const distance = Math.abs(visitor.x - x) + Math.abs(visitor.y - y)
                    entrances.push({ x, y, distance })
                  }
                }
              }
              
              if (entrances.length > 0) {
                // Prendre l'entrée la plus proche
                entrances.sort((a, b) => a.distance - b.distance)
                const targetExit = entrances[0]
                const path = findPath({ x: visitor.x, y: visitor.y }, targetExit)
                if (path.length > 0) {
                  visitor.path = path
                }
              }
            }
            
            // Se déplacer vers la sortie
            if (visitor.path.length > 0) {
              const stepsToTake = Math.floor(visitor.speed)
              for (let i = 0; i < stepsToTake && visitor.path.length > 0; i++) {
                const nextPos = visitor.path.shift()!
                visitor.x = nextPos.x
                visitor.y = nextPos.y
              }
              
                             // Si arrivé à l'entrée, marquer pour suppression immédiate
               if (visitor.path.length === 0 && park[visitor.y][visitor.x].type === "entrance") {
                 visitor.satisfaction = -1
                 if (selectedAgentId === visitor.id) {
                   setSelectedAgentId(null)
                 }
               }
            }
            break

          default:
          case "moving":
            if (visitor.currentAttraction) {
              visitor.timeInTransit++
              visitor.totalWaitTime++
            }

            if (!visitor.currentAttraction) {
              visitor.timeInTransit++ // Compteur pour le temps sans cible
              
              // D'abord essayer les attractions non visitées
              let availableAttractions = attractions.filter(
                (a) => !visitor.pastAttractions.includes(a.id)
              )
              
              // DEBUG: Log si agent reste jaune trop longtemps
              if (visitor.timeInTransit > 15) {
                console.log(`Agent ${visitor.id} jaune depuis ${visitor.timeInTransit} ticks:`, {
                  totalAttractions: attractions.length,
                  availableAttractions: availableAttractions.length,
                  pastAttractions: visitor.pastAttractions,
                  position: { x: visitor.x, y: visitor.y },
                  attractionsList: attractions.map(a => ({ id: a.id, x: a.x, y: a.y })),
                  availableList: availableAttractions.map(a => a.id)
                })
              }
              
              // Si toutes les attractions ont été visitées, permettre de revisiter (sauf la dernière)
              if (availableAttractions.length === 0) {
                const lastVisited = visitor.pastAttractions[visitor.pastAttractions.length - 1]
                availableAttractions = attractions.filter((a) => a.id !== lastVisited)
                
                // Reset la liste des attractions visitées pour éviter l'accumulation
                if (visitor.pastAttractions.length > 3) {
                  visitor.pastAttractions = visitor.pastAttractions.slice(-2) // Garder seulement les 2 dernières
                }
              }
              
              // Si toujours aucune attraction ET que l'agent est bloqué depuis un moment
              if (availableAttractions.length === 0 && visitor.timeInTransit > 5) {
                // FORCER la revisite de toutes les attractions
                availableAttractions = attractions
                visitor.pastAttractions = [] // Reset complet
              }
              
              if (availableAttractions.length > 0) {
                // DEBUG: Log AVANT assignation
                const debugThis = visitor.timeInTransit > 15
                if (debugThis) {
                  console.log(`Agent ${visitor.id} va essayer d'assigner une attraction, timeInTransit: ${visitor.timeInTransit}`)
                }
                
                // SIMPLIFIER: Prendre une attraction aléatoire pour éviter les bugs complexes
                const selectedAttraction = availableAttractions[Math.floor(Math.random() * availableAttractions.length)]
                
                visitor.currentAttraction = selectedAttraction.id
                
                // DEBUG: Log l'assignation
                if (debugThis) {
                  console.log(`Agent ${visitor.id} assigné à attraction ${selectedAttraction.id}`)
                }
                
                // IMMÉDIATEMENT calculer un chemin vers la nouvelle cible
                const queueCells = getQueueCellsForAttraction(selectedAttraction.id)
                if (queueCells.length > 0) {
                  const targetCell = queueCells[0]
                  const path = findPath({ x: visitor.x, y: visitor.y }, targetCell)
                  if (path.length > 0) {
                    visitor.path = path
                    visitor.timeInTransit = 0 // Reset seulement si succès
                  } else {
                    // DEBUG: Pathfinding failed
                    if (debugThis) {
                      console.log(`Agent ${visitor.id} ne peut pas atteindre attraction ${selectedAttraction.id}, reset target`)
                    }
                    visitor.currentAttraction = null // Reset la cible si pas de chemin
                  }
                } else {
                  // DEBUG: No queue cells
                  if (debugThis) {
                    console.log(`Agent ${visitor.id} : attraction ${selectedAttraction.id} n'a pas de queue`)
                  }
                  visitor.currentAttraction = null // Pas de queue = pas d'attraction valide
                }
              } else {
                // SECOURS ULTIME : Si vraiment aucune attraction trouvée après 10 ticks
                if (visitor.timeInTransit > 10 && attractions.length > 0) {
                  console.log(`Agent ${visitor.id}: SECOURS ULTIME activé`)
                  const randomAttraction = attractions[Math.floor(Math.random() * attractions.length)]
                  visitor.currentAttraction = randomAttraction.id
                  visitor.pastAttractions = [] // Reset complet pour permettre de revisiter
                  
                  // Essayer de calculer un chemin immédiatement
                  const queueCells = getQueueCellsForAttraction(randomAttraction.id)
                  if (queueCells.length > 0) {
                    const targetCell = queueCells[0]
                    const path = findPath({ x: visitor.x, y: visitor.y }, targetCell)
                    if (path.length > 0) {
                      visitor.path = path
                      visitor.timeInTransit = 0
                      console.log(`Agent ${visitor.id}: Secours réussi vers attraction ${randomAttraction.id}`)
                    } else {
                      console.log(`Agent ${visitor.id}: Secours échoué - pas de chemin vers ${randomAttraction.id}`)
                      visitor.currentAttraction = null
                    }
                  } else {
                    console.log(`Agent ${visitor.id}: Secours échoué - pas de queue pour ${randomAttraction.id}`)
                    visitor.currentAttraction = null
                  }
                }
              }
            }

            // Cette logique est maintenant gérée dans le système de récupération plus bas

            if (visitor.path.length > 0) {
              const stepsToTake = Math.floor(visitor.speed)
              for (let i = 0; i < stepsToTake && visitor.path.length > 0; i++) {
                const nextPos = visitor.path.shift()!
                visitor.x = nextPos.x
                visitor.y = nextPos.y

                                // Si arrivé à la fin du chemin et sur une case de queue
                if (visitor.path.length === 0 && park[visitor.y][visitor.x].type === "queue" && visitor.currentAttraction) {
                  const attraction = attractions.find(a => a.id === visitor.currentAttraction)
                  if (attraction) {
                    const ridingVisitors = prevVisitors.filter(
                      (v: Visitor) => v.currentAttraction === attraction.id && v.state === "riding"
                    ).length
                    
                    // FORCER l'entrée en queue même si l'attraction a de la place
                    // Cela garantit l'ordre d'arrivée et évite les dépassements
                    const queuePosition = getNextQueuePosition(visitor.currentAttraction, prevVisitors)
                    
                    if (queuePosition) {
                      visitor.state = "inQueue"
                      visitor.waitTime = 0
                      visitor.timeInTransit = 0
                      visitor.queuePosition = queuePosition.position
                      visitor.x = queuePosition.cell.x
                      visitor.y = queuePosition.cell.y
                    } else {
                      // Queue pleine, chercher une autre attraction
                      visitor.currentAttraction = null
                      visitor.timeInTransit = 0
                    }
                  }
                }
              }
            }
            
            // SYSTÈME DE RÉCUPÉRATION : Détecter les agents bloqués
            if (visitor.state === "moving" && visitor.currentAttraction && visitor.path.length === 0) {
              // Agent sans chemin vers sa cible = RÉESSAYER LE PATHFINDING
              const attraction = attractions.find((a) => a.id === visitor.currentAttraction)
              if (attraction) {
                const queueCells = getQueueCellsForAttraction(visitor.currentAttraction)
                if (queueCells.length > 0) {
                  const targetCell = queueCells[0]
                  const path = findPath({ x: visitor.x, y: visitor.y }, targetCell)
                  if (path.length > 0) {
                    visitor.path = path
                    visitor.timeInTransit = 0 // Reset le compteur si chemin trouvé
                  } else {
                    visitor.timeInTransit++
                    
                    // Si bloqué depuis trop longtemps, téléporter vers une entrée
                    if (visitor.timeInTransit > 30) {
                      const entrances: { x: number; y: number }[] = []
                      for (let y = 0; y < park.length; y++) {
                        for (let x = 0; x < park[0].length; x++) {
                          if (park[y][x].type === "entrance") {
                            entrances.push({ x, y })
                          }
                        }
                      }
                      
                      if (entrances.length > 0) {
                        const randomEntrance = entrances[Math.floor(Math.random() * entrances.length)]
                        visitor.x = randomEntrance.x
                        visitor.y = randomEntrance.y
                        visitor.timeInTransit = 0
                        visitor.path = []
                        // Garder la même attraction cible, il va essayer de nouveau
                      }
                    }
                  }
                } else {
                  // Pas de queue trouvée, changer d'attraction
                  visitor.currentAttraction = null
                  visitor.timeInTransit = 0
                }
              }
            }
            break
        }

        if (params.satisfactionEnabled) {
          visitor.satisfaction = calculateSatisfaction(visitor)
        } else {
          visitor.satisfaction = params.initialSatisfaction
        }

        return visitor
      })

      // NOUVELLE LOGIQUE DE RÉINDEXATION DES FILES
      // Cette section s'assure que les queuePosition sont contiguës (0, 1, 2...)
      // après que des visiteurs soient entrés dans l'attraction ou aient quitté la file.
      attractions.forEach(attraction => {
        const visitorsInThisQueue = updatedVisitors
          .filter(v => v.currentAttraction === attraction.id && v.state === "inQueue")
          .sort((a, b) => {
            // Trier par la position actuelle, les positions non valides (-1) à la fin
            if (a.queuePosition === -1) return 1;
            if (b.queuePosition === -1) return -1;
            return a.queuePosition - b.queuePosition;
          });

        // Réassigner les positions pour combler les trous et assurer la contiguïté
        visitorsInThisQueue.forEach((visitor, index) => {
          visitor.queuePosition = index;
        });
      });

      // Faire avancer toutes les queues pour maintenir les positions physiques à jour
      // Cette fonction met à jour les coordonnées X,Y des visiteurs en fonction de leur queuePosition.
      attractions.forEach(attraction => {
        advanceQueueForAttraction(attraction.id, updatedVisitors)
      })

      // Vérifier les seuils de satisfaction pour déclencher l'état "leaving"
      if (params.satisfactionEnabled) {
        updatedVisitors.forEach(visitor => {
          if (visitor.state === "moving" && visitor.currentAttraction === null) {
            const currentSatisfaction = calculateSatisfaction(visitor)
            if (currentSatisfaction <= params.satisfactionMin || currentSatisfaction >= params.satisfactionMax) {
              visitor.state = "leaving"
              visitor.path = [] // Reset le chemin pour qu'il calcule un nouveau chemin vers la sortie
            }
          }
        })
      }

      // Supprimer immédiatement les visiteurs qui sont sortis du parc (satisfaction === -1)
      const remainingVisitors = updatedVisitors.filter((visitor) => {
        if (visitor.satisfaction === -1) {
          if (selectedAgentId === visitor.id) {
            setSelectedAgentId(null)
          }
          return false
        }
        return true
      })

      // Nettoyer la sélection si l'agent n'existe plus
      if (selectedAgentId !== null && !remainingVisitors.find(v => v.id === selectedAgentId)) {
        setSelectedAgentId(null)
      }

      const inAttractions = remainingVisitors.filter((v) => v.state === "riding").length
      const inQueues = remainingVisitors.filter((v) => v.state === "inQueue").length
      const moving = remainingVisitors.filter((v) => v.state === "moving" || v.state === "leaving").length
      const totalPresents = inAttractions + inQueues + moving

      const averageSatisfaction =
        remainingVisitors.length > 0
          ? remainingVisitors.reduce((sum, v) => sum + v.satisfaction, 0) / remainingVisitors.length
          : 0

      setStats((prev) => ({
        ...prev,
        inAttractions,
        inQueues,
        moving,
        totalExited: Math.max(0, prev.totalEntered - totalPresents),
        averageSatisfaction,
      }))

      tickRef.current++
              setStatsHistory((prev) => {
        const newHistory = [
          ...prev,
          {
            time: tickRef.current,
            totalPresents,
            inAttractions,
            inQueues,
            moving,
            averageSatisfaction,
            satisfactionMin: params.satisfactionMin,
            satisfactionMax: params.satisfactionMax,
          },
        ]
        
        return newHistory
      })

      return remainingVisitors
    })

    setAttractions((prevAttractions) => {
      return prevAttractions.map((attraction) => {
        const visitorsInQueue = visitors.filter(
          (v) => v.currentAttraction === attraction.id && v.state === "inQueue"
        ).length
        const visitorsInside = visitors.filter((v) => v.currentAttraction === attraction.id && v.state === "riding").length

        let averageRemainingTime = 0
        const visitorsInsideList = visitors.filter((v) => v.currentAttraction === attraction.id && v.state === "riding")
        if (visitorsInsideList.length > 0) {
          const totalRemainingTime = visitorsInsideList.reduce((sum, v) => sum + (attraction.waitTime - v.waitTime), 0)
          averageRemainingTime = totalRemainingTime / visitorsInsideList.length
        }

        return {
          ...attraction,
          visitorsInQueue,
          visitorsInside,
          occupancyRate: (visitorsInside / attraction.capacity) * 100,
          averageRemainingTime,
        }
      })
    })
  }

  // Gestion de la simulation
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        spawnVisitors()
        updateSimulation()
      }, 1000 / params.speed)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRunning, params.speed, park, attractions, visitors])

  // Initialisation
  useEffect(() => {
    generatePark()
  }, [])

  // Fonction pour déterminer la couleur de debug des visiteurs
  const getVisitorDebugColor = (visitor: Visitor): string => {
    // Priorité 1: État "riding", "inQueue" ou "leaving"
    if (visitor.state === "riding") {
      return "#9333ea" // Violet - en attraction
    }
    if (visitor.state === "inQueue") {
      return "#0ea5e9" // Bleu ciel - en file
    }
    if (visitor.state === "leaving") {
      return "#dc2626" // Rouge foncé - quitte le parc
    }
    
    // Priorité 2: Problèmes de pathfinding
    if (visitor.state === "moving") {
      if (!visitor.currentAttraction) {
        // Distinguer: pas de cible disponible vs en train de chercher
        const hasVisitedAll = visitor.pastAttractions.length >= attractions.length
        return hasVisitedAll ? "#f59e0b" : "#facc15" // Orange si toutes visitées, jaune si en recherche
      }
      if (visitor.path.length === 0) {
        return "#ef4444" // Rouge - bloqué (pas de chemin)
      }
      if (visitor.timeInTransit > 20) {
        return "#ec4899" // Rose - bloqué depuis longtemps
      }
      // Vert - tout va bien, en mouvement
      return visitor.isFamily ? "#059669" : "#16a34a"
    }
    
    // Fallback
    return visitor.isFamily ? "#3182ce" : "#e53e3e"
  }

  const getCellColor = (cell: ParkCell, x: number, y: number): string => {
    switch (cell.type) {
      case "wall":
        return "#2d3748"
      case "road":
        return "#a0aec0"
      case "entrance":
        return "#48bb78"
      case "attraction":
        if (cell.attractionId !== undefined) {
          const attraction = attractions.find((a) => a.id === cell.attractionId)
          const visitorsInAttraction = visitors.filter(
            (v) => v.currentAttraction === attraction?.id && v.state === "riding",
          ).length
          if (visitorsInAttraction > 0) {
            return "#dc2626" // Rouge si des visiteurs sont dans l'attraction
          } else if (attraction && attraction.occupancyRate > 50) {
            return "#f59e0b" // Orange si file d'attente importante
          }
        }
        return "#ed8936"
      case "queue":
        if (cell.attractionId !== undefined) {
          // Compter les visiteurs physiquement présents sur cette case
          const visitorsOnThisCell = visitors.filter(
            (v) => v.x === x && v.y === y && v.state === "inQueue"
          ).length
          
          if (visitorsOnThisCell > 0) {
            // Gradient selon le nombre de visiteurs sur la case
            const intensity = Math.min(visitorsOnThisCell / params.visitorsPerQueueCell, 1)
            const blue = Math.floor(59 + (130 * intensity)) // De 59 à 189
            return `rgb(59, ${blue}, 246)` // Bleu plus intense selon l'occupation
          }
        }
        return "#e2e8f0"
      default:
        return "#1a202c"
    }
  }

  return (
    <div
      className="min-h-screen relative p-4"
      style={{
        backgroundImage: "url(/SYMUA2025/theme-park-bg.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Overlay avec flou */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>

      {/* Contenu principal */}
      <div className="relative z-10 max-w-none mx-4">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">Simulateur de Parc d'Attractions</h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Contrôles et légende */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="bg-white/80 backdrop-blur-md shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Contrôles
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    onClick={() => setIsRunning(!isRunning)}
                    variant={isRunning ? "destructive" : "default"}
                    className="flex-1"
                  >
                    {isRunning ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                    {isRunning ? "Pause" : "Démarrer"}
                  </Button>
                  <Button
                    onClick={() => {
                      setIsRunning(false)
                      generatePark()
                    }}
                    variant="outline"
                    title="Générer nouvelle carte"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>

                <Button
                  onClick={() => {
                    setIsRunning(false)
                    generatePark()
                  }}
                  className="w-full mt-2"
                  variant="secondary"
                >
                  Générer Nouvelle Carte
                </Button>

                {/* Switch pour afficher les stats */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    {showStats ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    Afficher Stats
                  </label>
                  <Switch checked={showStats} onCheckedChange={setShowStats} />
                </div>

                <div className="space-y-4">
                  {/* Catégorie: Génération du Parc */}
                  <div className="border rounded-lg p-3 bg-gray-50">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Génération du Parc</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">Largeur: {params.width}</label>
                        <Slider
                          value={[params.width]}
                          onValueChange={([value]) => {
                            setParams((prev) => ({ ...prev, width: value }))
                          }}
                          min={10}
                          max={200}
                          step={5}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">
                          Temps d'attente Max en File: {params.maxQueueWaitTime} ticks
                        </label>
                        <Slider
                          value={[params.maxQueueWaitTime]}
                          onValueChange={([value]) => {
                            setParams((prev) => ({ ...prev, maxQueueWaitTime: value }))
                          }}
                          min={0}
                          max={100}
                          step={1}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">Hauteur: {params.height}</label>
                        <Slider
                          value={[params.height]}
                          onValueChange={([value]) => {
                            setParams((prev) => ({ ...prev, height: value }))
                          }}
                          min={10}
                          max={200}
                          step={5}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">Entrées: {params.entries}</label>
                        <Slider
                          value={[params.entries]}
                          onValueChange={([value]) => {
                            setParams((prev) => ({ ...prev, entries: value }))
                          }}
                          min={1}
                          max={10}
                          step={1}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">Nœuds: {params.numberOfNodes}</label>
                        <Slider
                          value={[params.numberOfNodes]}
                          onValueChange={([value]) => {
                            setParams((prev) => ({ ...prev, numberOfNodes: value }))
                          }}
                          min={50}
                          max={1000}
                          step={50}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">Largeur Route: {params.roadWidth}</label>
                        <Slider
                          value={[params.roadWidth]}
                          onValueChange={([value]) => {
                            setParams((prev) => ({ ...prev, roadWidth: value }))
                          }}
                          min={1}
                          max={5}
                          step={1}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Catégorie: Attractions */}
                  <div className="border rounded-lg p-3 bg-blue-50">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Attractions</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">
                          Nombre d'Attractions: {params.numberOfAttractions}
                        </label>
                        <Slider
                          value={[params.numberOfAttractions]}
                          onValueChange={([value]) => {
                            setParams((prev) => ({ ...prev, numberOfAttractions: value }))
                          }}
                          min={1}
                          max={50}
                          step={1}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">Longueur File: {params.queueLength}</label>
                        <Slider
                          value={[params.queueLength]}
                          onValueChange={([value]) => {
                            setParams((prev) => ({ ...prev, queueLength: value }))
                          }}
                          min={1}
                          max={20}
                          step={1}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">
                          Visiteurs par Case Queue: {params.visitorsPerQueueCell}
                        </label>
                        <Slider
                          value={[params.visitorsPerQueueCell]}
                          onValueChange={([value]) => setParams((prev) => ({ ...prev, visitorsPerQueueCell: value }))}
                          min={1}
                          max={10}
                          step={1}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Catégorie: Visiteurs */}
                  <div className="border rounded-lg p-3 bg-green-50">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Visiteurs</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">
                          Densité Entrée: {(params.spawnRate * 100).toFixed(0)}%
                        </label>
                        <Slider
                          value={[params.spawnRate]}
                          onValueChange={([value]) => setParams((prev) => ({ ...prev, spawnRate: value }))}
                          min={0.01}
                          max={1.0}
                          step={0.01}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">Vitesse Simulation: {params.speed}x</label>
                        <Slider
                          value={[params.speed]}
                          onValueChange={([value]) => setParams((prev) => ({ ...prev, speed: value }))}
                          min={1}
                          max={200}
                          step={1}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Catégorie: Satisfaction (fusionnée) */}
                  <div className="border rounded-lg p-3 bg-yellow-50">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">Satisfaction</h3>
                      <Switch
                        checked={params.satisfactionEnabled}
                        onCheckedChange={(value) => setParams((prev) => ({ ...prev, satisfactionEnabled: value }))}
                      />
                    </div>
                    <div className={`space-y-3 ${!params.satisfactionEnabled ? "opacity-50 pointer-events-none" : ""}`}>
                      <div>
                        <label className="text-sm font-medium">
                          Satisfaction Initiale: {params.initialSatisfaction}%
                        </label>
                        <Slider
                          value={[params.initialSatisfaction]}
                          onValueChange={([value]) => setParams((prev) => ({ ...prev, initialSatisfaction: value }))}
                          min={0}
                          max={100}
                          step={1}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">
                          Gain par Attraction: +{params.satisfactionGainPerAttraction}
                        </label>
                        <Slider
                          value={[params.satisfactionGainPerAttraction]}
                          onValueChange={([value]) =>
                            setParams((prev) => ({ ...prev, satisfactionGainPerAttraction: value }))
                          }
                          min={0}
                          max={50}
                          step={1}
                          className="mt-1"
                        />
                      </div>

                                              <div>
                          <label className="text-sm font-medium">
                            Perte par Attente: -{params.satisfactionLossPerWaitTime.toFixed(1)}
                          </label>
                          <Slider
                            value={[params.satisfactionLossPerWaitTime]}
                            onValueChange={([value]) =>
                              setParams((prev) => ({ ...prev, satisfactionLossPerWaitTime: value }))
                            }
                            min={0.0}
                            max={10.0}
                            step={0.1}
                            className="mt-1"
                          />
                        </div>

                      <div>
                        <label className="text-sm font-medium">Seuil Min (sortie): {params.satisfactionMin}%</label>
                        <Slider
                          value={[params.satisfactionMin]}
                          onValueChange={([value]) => setParams((prev) => ({ ...prev, satisfactionMin: value }))}
                          min={0}
                          max={100}
                          step={1}
                          className="mt-1"
                        />
                      </div>

                                              <div>
                          <label className="text-sm font-medium">Seuil Max (sortie): {params.satisfactionMax}%</label>
                          <Slider
                            value={[params.satisfactionMax]}
                            onValueChange={([value]) => setParams((prev) => ({ ...prev, satisfactionMax: value }))}
                            min={0}
                            max={100}
                            step={1}
                            className="mt-1"
                          />
                        </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>


          </div>

          {/* Visualisation du parc */}
          <div className="lg:col-span-2">
            <Card className="bg-white/80 backdrop-blur-md shadow-lg">
              <CardHeader>
                <CardTitle>Parc d'Attractions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative overflow-auto max-h-[600px] border rounded" id="park-container">
                  <svg width={park[0]?.length * 8 || 0} height={park.length * 8}>
                    {/* Rendu du parc */}
                    {park.map((row, y) =>
                      row.map((cell, x) => (
                        <rect key={`${x}-${y}`} x={x * 8} y={y * 8} width={8} height={8} fill={getCellColor(cell, x, y)} />
                      )),
                    )}

                    {/* Rendu des visiteurs */}
                    {visitors.map((visitor) => {
                      const isSelected = selectedAgentId === visitor.id
                      return (
                        <g key={visitor.id}>
                          {/* Cercle de surbrillance pour l'agent sélectionné */}
                          {isSelected && (
                            <circle
                              cx={visitor.x * 8 + 4}
                              cy={visitor.y * 8 + 4}
                              r={6}
                              fill="none"
                              stroke="#ffff00"
                              strokeWidth={2}
                              opacity={0.8}
                            />
                          )}
                          
                          {/* Chemin de l'agent sélectionné */}
                          {isSelected && visitor.path.length > 0 && (
                            <g>
                              {visitor.path.map((point, index) => (
                                <circle
                                  key={index}
                                  cx={point.x * 8 + 4}
                                  cy={point.y * 8 + 4}
                                  r={1}
                                  fill="#ffff00"
                                  opacity={0.6}
                                />
                              ))}
                              <polyline
                                points={[
                                  `${visitor.x * 8 + 4},${visitor.y * 8 + 4}`,
                                  ...visitor.path.map(p => `${p.x * 8 + 4},${p.y * 8 + 4}`)
                                ].join(' ')}
                                fill="none"
                                stroke="#ffff00"
                                strokeWidth={1}
                                opacity={0.5}
                              />
                            </g>
                          )}
                          
                          <circle
                            cx={visitor.x * 8 + 4}
                            cy={visitor.y * 8 + 4}
                            r={isSelected ? 3 : 2}
                            fill={getVisitorDebugColor(visitor)}
                            opacity={visitor.state === "riding" ? 0.7 : 1}
                            stroke={visitor.path.length > 0 ? "#ffffff" : "none"}
                            strokeWidth={isSelected ? 1 : 0.5}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedAgentId(isSelected ? null : visitor.id)}
                          />
                          
                          {/* ID de l'agent sélectionné */}
                          {isSelected && (
                            <text 
                              x={visitor.x * 8 + 4} 
                              y={visitor.y * 8 - 8} 
                              fontSize="8" 
                              fill="#ffff00" 
                              textAnchor="middle"
                              fontWeight="bold"
                            >
                              #{visitor.id}
                            </text>
                          )}
                          
                          {showStats && (
                            <text x={visitor.x * 8 + 8} y={visitor.y * 8 + 2} fontSize="6" fill="black">
                              {`${visitor.state}|T:${visitor.currentAttraction || "X"}|P:${visitor.path.length}|W:${visitor.timeInTransit}|Past:${visitor.pastAttractions.length}|Q:${visitor.queuePosition}`}
                            </text>
                          )}
                        </g>
                      )
                    })}

                    {/* Rendu des stats des attractions */}
                    {showStats &&
                      attractions.map((attraction) => (
                        <text
                          key={`stats-${attraction.id}`}
                          x={attraction.x * 8 + 8}
                          y={attraction.y * 8 - 2}
                          fontSize="8"
                          fill="white"
                        >
                          {`Pop: ${attraction.popularity.toFixed(1)}
Occ: ${attraction.visitorsInside}/${attraction.capacity} (${attraction.occupancyRate.toFixed(0)}%)
Queue: ${attraction.visitorsInQueue}
Temps: ${attraction.averageRemainingTime.toFixed(1)}`}
                        </text>
                      ))}
                  </svg>
                </div>
              </CardContent>
            </Card>

                        {/* Légende, Statistiques et Graphique */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {/* Légende */}
              <Card className="bg-white/80 backdrop-blur-md shadow-lg">
                <CardHeader>
                  <CardTitle>Légende</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-500 rounded"></div>
                    <span className="text-sm">Entrée</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-400 rounded"></div>
                    <span className="text-sm">Route</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-orange-500 rounded"></div>
                    <span className="text-sm">Attraction</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-200 border rounded"></div>
                    <span className="text-sm">File d'attente</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm">Visiteur (famille)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-sm">Visiteur (solo)</span>
                  </div>
                  
                  <div className="border-t pt-2 mt-2">
                    <div className="text-xs text-gray-600 mb-1">
                       <strong>Cliquez sur un visiteur</strong> pour le sélectionner et voir ses détails
                    </div>
                    {selectedAgentId !== null && (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-yellow-400 rounded-full"></div>
                        <span className="text-xs">Agent #{selectedAgentId} sélectionné</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Debug colors
                  <div className="border-t pt-2 mt-2">
                    <h4 className="text-xs font-semibold text-gray-600 mb-2">Debug Visiteurs:</h4>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                        <span>En mouvement OK</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                        <span>Bloqué (pas chemin)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                        <span>Cherche attraction</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        <span>Toutes visitées</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                        <span>Bloqué longtemps</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-sky-500 rounded-full"></div>
                        <span>En file</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                        <span>En attraction</span>
                      </div>
                    </div>
                  </div> */}
                </CardContent>
              </Card>

              {/* Statistiques */}
              <Card className="bg-white/80 backdrop-blur-md shadow-lg">
                <CardHeader>
                  <CardTitle>Statistiques</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total entrés:</span>
                    <Badge variant="secondary">{stats.totalEntered}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Total sortis:</span>
                    <Badge variant="destructive">{stats.totalExited}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Dans attractions:</span>
                    <Badge style={{ backgroundColor: "#ed8936", color: "white" }}>{stats.inAttractions}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>En file:</span>
                    <Badge style={{ backgroundColor: "#3182ce", color: "white" }}>{stats.inQueues}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>En déplacement:</span>
                    <Badge style={{ backgroundColor: "#e53e3e", color: "white" }}>{stats.moving}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Total présents:</span>
                    <Badge variant="outline">{stats.inAttractions + stats.inQueues + stats.moving}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Satisfaction moy:</span>
                    <Badge style={{ backgroundColor: "#10b981", color: "white" }}>
                      {stats.averageSatisfaction.toFixed(1)}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Graphique */}
            <div className="mt-4">
              <Card className="bg-white/80 backdrop-blur-md shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>
                      {currentChart === "stats" ? "Évolution des Statistiques" : "Évolution de la Satisfaction"}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentChart(currentChart === "stats" ? "satisfaction" : "stats")}
                      >
                        {currentChart === "stats" ? "→ Satisfaction" : "→ Statistiques"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      {currentChart === "stats" ? (
                        <LineChart data={statsHistory}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="time" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="totalPresents" stroke="#48bb78" name="Total présents" />
                          <Line type="monotone" dataKey="inAttractions" stroke="#ed8936" name="Dans attractions" />
                          <Line type="monotone" dataKey="inQueues" stroke="#3182ce" name="En file" />
                          <Line type="monotone" dataKey="moving" stroke="#e53e3e" name="En déplacement" />
                        </LineChart>
                      ) : (
                        <LineChart data={statsHistory}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="time" />
                          <YAxis domain={[0, 100]} />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="averageSatisfaction"
                            stroke="#10b981"
                            name="Satisfaction moyenne (%)"
                          />
                          <Line
                            type="monotone"
                            dataKey={() => params.satisfactionMin}
                            stroke="#ef4444"
                            strokeDasharray="5 5"
                            name={`Seuil Min (${params.satisfactionMin}%)`}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey={() => params.satisfactionMax}
                            stroke="#ef4444"
                            strokeDasharray="5 5"
                            name={`Seuil Max (${params.satisfactionMax}%)`}
                            dot={false}
                          />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sélection et Détails Agent */}
          <div className="lg:col-span-1 space-y-4">
            {/* Bouton sélection agent aléatoire */}
            <Card className="bg-white/80 backdrop-blur-md shadow-lg">
              <CardHeader>
                <CardTitle>Sélection Agent</CardTitle>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => {
                    if (visitors.length > 0) {
                      const randomVisitor = visitors[Math.floor(Math.random() * visitors.length)]
                      setSelectedAgentId(randomVisitor.id)
                      
                      // Centrer automatiquement sur l'agent
                      setTimeout(() => {
                        const container = document.getElementById('park-container')
                        if (container) {
                          const agentX = randomVisitor.x * 8
                          const agentY = randomVisitor.y * 8
                          container.scrollTo({
                            left: agentX - container.clientWidth / 2,
                            top: agentY - container.clientHeight / 2,
                            behavior: 'smooth'
                          })
                        }
                      }, 100)
                    }
                  }}
                  className="w-full"
                  disabled={visitors.length === 0}
                >
                  Sélectionner un Agent Aléatoire
                </Button>
                
                {selectedAgentId !== null && (
                  <Button 
                    onClick={() => setSelectedAgentId(null)}
                    variant="outline"
                    className="w-full mt-2"
                  >
                    ❌ Désélectionner
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Détails Agent Sélectionné */}
            {selectedAgentId !== null && (() => {
              const selectedAgent = visitors.find(v => v.id === selectedAgentId)
              if (!selectedAgent) return null
              
              const targetAttraction = selectedAgent.currentAttraction 
                ? attractions.find(a => a.id === selectedAgent.currentAttraction)
                : null

              return (
                <Card className="bg-yellow-50/90 backdrop-blur-md shadow-lg border-yellow-300">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-yellow-800">Agent #{selectedAgent.id}</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          const container = document.getElementById('park-container')
                          if (container) {
                            const agentX = selectedAgent.x * 8
                            const agentY = selectedAgent.y * 8
                            container.scrollTo({
                              left: agentX - container.clientWidth / 2,
                              top: agentY - container.clientHeight / 2,
                              behavior: 'smooth'
                            })
                          }
                        }}
                        className="text-yellow-600 hover:text-yellow-800"
                        title="Centrer sur l'agent"
                      >
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <strong>Position:</strong> ({selectedAgent.x}, {selectedAgent.y})
                      </div>
                      <div>
                        <strong>État:</strong> <Badge variant="outline">{selectedAgent.state}</Badge>
                      </div>
                      <div>
                        <strong>Famille:</strong> {selectedAgent.isFamily ? "Oui" : "Non"}
                      </div>
                      <div>
                        <strong>Âge:</strong> {selectedAgent.age}
                      </div>
                      <div>
                        <strong>Genre préféré:</strong> {selectedAgent.preferredGenre}
                      </div>
                      <div>
                        <strong>Vitesse:</strong> {selectedAgent.speed.toFixed(1)}
                      </div>
                    </div>
                    
                    <div className="border-t pt-2">
                      <div><strong>Satisfaction:</strong> {selectedAgent.satisfaction.toFixed(1)}%</div>
                      <div><strong>Temps transit:</strong> {selectedAgent.timeInTransit}</div>
                      <div><strong>Temps attente total:</strong> {selectedAgent.totalWaitTime}</div>
                      <div><strong>Attractions visitées:</strong> {selectedAgent.attractionsVisited}</div>
                    </div>

                    <div className="border-t pt-2">
                      <div><strong>Cible actuelle:</strong> {
                        targetAttraction 
                          ? `${targetAttraction.id} (${targetAttraction.tags.join(', ')})` 
                          : "Aucune"
                      }</div>
                      <div><strong>Chemin restant:</strong> {selectedAgent.path.length} cases</div>
                      <div><strong>Position queue:</strong> {
                        selectedAgent.queuePosition >= 0 
                          ? `Position ${selectedAgent.queuePosition}` 
                          : "Pas en queue"
                      }</div>
                    </div>

                    {selectedAgent.pastAttractions.length > 0 && (
                      <div className="border-t pt-2">
                        <strong>Historique:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedAgent.pastAttractions.map(id => (
                            <Badge key={id} variant="secondary" className="text-xs">
                              {id}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
