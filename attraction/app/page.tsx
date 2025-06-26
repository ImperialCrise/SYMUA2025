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
  isInQueue: boolean
  isWaitingInQueue: boolean // Nouveau état pour différencier file d'attente et attraction
  currentAttraction: number | null
  path: { x: number; y: number }[]
  speed: number
  waitTime: number
  pastAttractions: number[]
  totalWaitTime: number // Temps total d'attente
  attractionsVisited: number // Nombre d'attractions visitées
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
  totalEntered: number
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
    speed: 150, // Vitesse au maximum
    initialSatisfaction: 50, // Nouveau paramètre
    satisfactionGainPerAttraction: 15, // Nouveau paramètre
    satisfactionLossPerWaitTime: 0.5, // Nouveau paramètre
    satisfactionLossPerCurrentWait: 0.3, // Nouveau paramètre
    satisfactionMin: 10, // Nouveau paramètre - seuil minimum
    satisfactionMax: 90, // Nouveau paramètre - seuil maximum
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
              d2x < width &&
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

    // Pénalité pour le temps d'attente total
    satisfaction -= visitor.totalWaitTime * params.satisfactionLossPerWaitTime

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
    if (visitor.isWaitingInQueue || visitor.isInQueue) {
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
          satisfaction: params.initialSatisfaction, // Utiliser le paramètre
          isInQueue: false,
          isWaitingInQueue: false, // Nouveau état
          currentAttraction: null,
          path: [],
          speed: isFamily ? 1 + Math.random() : 2 + Math.random() * 2,
          waitTime: 0,
          pastAttractions: [],
          totalWaitTime: 0,
          attractionsVisited: 0,
        }

        setVisitors((prev) => [...prev, newVisitor])
        setStats((prev) => ({ ...prev, totalEntered: prev.totalEntered + 1 }))
      }
    }
  }

  // Mise à jour de la simulation
  const updateSimulation = () => {
    setVisitors((prevVisitors) => {
      let exitedCount = 0
      const updatedVisitors = prevVisitors.map((visitor) => {
        // Gestion des visiteurs dans l'attraction
        if (visitor.isInQueue) {
          visitor.waitTime++
          visitor.totalWaitTime++
          const attraction = attractions.find((a) => a.id === visitor.currentAttraction)
          if (attraction && visitor.waitTime >= attraction.waitTime) {
            visitor.isInQueue = false
            visitor.pastAttractions.push(visitor.currentAttraction!)
            visitor.attractionsVisited++
            visitor.currentAttraction = null
            visitor.path = []
            visitor.waitTime = 0
          }
        }
        // Gestion des visiteurs en file d'attente
        else if (visitor.isWaitingInQueue) {
          visitor.waitTime++
          visitor.totalWaitTime++
          const attraction = attractions.find((a) => a.id === visitor.currentAttraction)
          if (attraction) {
            // Vérifier si l'attraction a de la place
            const visitorsInAttraction = prevVisitors.filter(
              (v) => v.currentAttraction === attraction.id && v.isInQueue,
            ).length
            if (visitorsInAttraction < attraction.capacity) {
              // Passer de la file à l'attraction
              visitor.isWaitingInQueue = false
              visitor.isInQueue = true
              visitor.waitTime = 0 // Reset pour le temps dans l'attraction
            }
          }
        }
        // Gestion des visiteurs en déplacement
        else {
          // Choisir une nouvelle destination si nécessaire
          if (visitor.path.length === 0 && !visitor.currentAttraction) {
            const availableAttractions = attractions.filter(
              (a) =>
                !visitor.pastAttractions.includes(a.id) &&
                (a.tags.includes(visitor.preferredGenre) || Math.random() < 0.3),
            )

            if (availableAttractions.length > 0) {
              const targetAttraction = availableAttractions[Math.floor(Math.random() * availableAttractions.length)]

              // Trouver une case de queue pour cette attraction
              for (let y = 0; y < park.length; y++) {
                for (let x = 0; x < park[0].length; x++) {
                  if (park[y][x].type === "queue" && park[y][x].attractionId === targetAttraction.id) {
                    const path = findPath({ x: visitor.x, y: visitor.y }, { x, y })
                    if (path.length > 0) {
                      visitor.path = path
                      visitor.currentAttraction = targetAttraction.id
                      break
                    }
                  }
                }
              }
            }
          }

          // Déplacement
          if (visitor.path.length > 0) {
            const stepsToTake = Math.floor(visitor.speed)
            for (let i = 0; i < stepsToTake && visitor.path.length > 0; i++) {
              const nextPos = visitor.path.shift()!
              visitor.x = nextPos.x
              visitor.y = nextPos.y

              // Vérifier si arrivé à la destination (file d'attente)
              if (visitor.path.length === 0 && park[visitor.y][visitor.x].type === "queue") {
                visitor.isWaitingInQueue = true // Nouveau : d'abord en file
                visitor.waitTime = 0
              }
            }
          }
        }

        // Mettre à jour la satisfaction
        visitor.satisfaction = calculateSatisfaction(visitor)

        return visitor
      })

      // Filtrer les visiteurs qui sortent (satisfaction en dehors des seuils)
      const remainingVisitors = updatedVisitors.filter((visitor) => {
        if (visitor.satisfaction <= params.satisfactionMin || visitor.satisfaction >= params.satisfactionMax) {
          exitedCount++
          return false
        }
        return true
      })

      // Mettre à jour le compteur de sorties
      if (exitedCount > 0) {
        setStats((prev) => ({ ...prev, totalExited: prev.totalExited + exitedCount }))
      }

      return remainingVisitors
    })

    // Corriger les statistiques - maintenant avec les bons états
    const inAttractions = visitors.filter((v) => v.isInQueue).length // Dans l'attraction
    const inQueues = visitors.filter((v) => v.isWaitingInQueue).length // En file d'attente
    const moving = visitors.filter((v) => v.path.length > 0).length // En déplacement

    // Calculer la satisfaction moyenne
    const averageSatisfaction =
      visitors.length > 0 ? visitors.reduce((sum, v) => sum + v.satisfaction, 0) / visitors.length : 0

    setStats((prev) => ({
      ...prev,
      inAttractions,
      inQueues,
      moving,
      averageSatisfaction,
    }))

    // Mettre à jour les statistiques des attractions
    setAttractions((prevAttractions) => {
      return prevAttractions.map((attraction) => {
        const visitorsInQueue = visitors.filter(
          (v) => v.currentAttraction === attraction.id && v.isWaitingInQueue,
        ).length
        const visitorsInside = visitors.filter((v) => v.currentAttraction === attraction.id && v.isInQueue).length

        let averageRemainingTime = 0
        const visitorsInsideList = visitors.filter((v) => v.currentAttraction === attraction.id && v.isInQueue)
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

    // Ajouter aux statistiques historiques
    tickRef.current++
    setStatsHistory((prev) => {
      const newHistory = [
        ...prev,
        {
          time: tickRef.current,
          totalEntered: stats.totalEntered,
          inAttractions,
          inQueues,
          moving,
          averageSatisfaction,
          satisfactionMin: params.satisfactionMin,
          satisfactionMax: params.satisfactionMax,
        },
      ]
      return newHistory.slice(-100)
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
  }, [isRunning, params.speed, park, attractions])

  // Initialisation
  useEffect(() => {
    generatePark()
  }, [])

  const getCellColor = (cell: ParkCell): string => {
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
            (v) => v.currentAttraction === attraction?.id && v.isInQueue,
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
          const visitorsInQueue = visitors.filter(
            (v) => v.currentAttraction === cell.attractionId && v.isWaitingInQueue,
          ).length
          if (visitorsInQueue > 0) {
            return "#3b82f6" // Bleu si des visiteurs sont en file
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
        backgroundImage: "url(/theme-park-bg.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Overlay sans flou */}
      <div className="absolute inset-0 bg-black/10"></div>

      {/* Contenu principal */}
      <div className="relative z-10 max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">Simulateur de Parc d'Attractions</h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Contrôles */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
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
                          min={30}
                          max={100}
                          step={5}
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
                          min={30}
                          max={100}
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
                          max={5}
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
                          min={100}
                          max={800}
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
                          max={4}
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
                          min={5}
                          max={40}
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
                          min={3}
                          max={8}
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
                          min={0.05}
                          max={0.5}
                          step={0.05}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">Vitesse Simulation: {params.speed}x</label>
                        <Slider
                          value={[params.speed]}
                          onValueChange={([value]) => setParams((prev) => ({ ...prev, speed: value }))}
                          min={1}
                          max={150}
                          step={1}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Catégorie: Satisfaction (fusionnée) */}
                  <div className="border rounded-lg p-3 bg-yellow-50">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Satisfaction</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">
                          Satisfaction Initiale: {params.initialSatisfaction}%
                        </label>
                        <Slider
                          value={[params.initialSatisfaction]}
                          onValueChange={([value]) => setParams((prev) => ({ ...prev, initialSatisfaction: value }))}
                          min={10}
                          max={90}
                          step={5}
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
                          min={5}
                          max={30}
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
                          min={0.1}
                          max={5.0}
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
                          max={50}
                          step={5}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">Seuil Max (sortie): {params.satisfactionMax}%</label>
                        <Slider
                          value={[params.satisfactionMax]}
                          onValueChange={([value]) => setParams((prev) => ({ ...prev, satisfactionMax: value }))}
                          min={50}
                          max={100}
                          step={5}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Statistiques */}
            <Card>
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

          {/* Visualisation du parc */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Parc d'Attractions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative overflow-auto max-h-[600px] border rounded">
                  <svg width={park[0]?.length * 8 || 0} height={park.length * 8}>
                    {/* Rendu du parc */}
                    {park.map((row, y) =>
                      row.map((cell, x) => (
                        <rect key={`${x}-${y}`} x={x * 8} y={y * 8} width={8} height={8} fill={getCellColor(cell)} />
                      )),
                    )}

                    {/* Rendu des visiteurs */}
                    {visitors.map((visitor) => (
                      <g key={visitor.id}>
                        <circle
                          cx={visitor.x * 8 + 4}
                          cy={visitor.y * 8 + 4}
                          r={2}
                          fill={visitor.isFamily ? "#3182ce" : "#e53e3e"}
                          opacity={visitor.isInQueue ? 0.5 : 1}
                        />
                        {showStats && (
                          <text x={visitor.x * 8 + 8} y={visitor.y * 8 + 2} fontSize="8" fill="white">
                            {`Sat:${visitor.satisfaction.toFixed(0)}%`}
                          </text>
                        )}
                      </g>
                    ))}

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

            {/* Légende et Graphique */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {/* Légende */}
              <Card>
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
                </CardContent>
              </Card>

              {/* Graphique des statistiques avec pagination */}
              <Card>
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
                          <Line type="monotone" dataKey="totalEntered" stroke="#48bb78" name="Total entrés" />
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
        </div>
      </div>
    </div>
  )
}
