"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Play, Pause, RotateCcw, Settings, Eye, EyeOff } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

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
  waitTime: number
  pastAttractions: number[]
  totalWaitTime: number
  attractionsVisited: number
  timeInTransit: number
  queuePosition: number
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

  const [params, setParams] = useState({
    width: 100,
    height: 55,
    entries: 3,
    numberOfNodes: 439,
    roadWidth: 2,
    queueLength: 5,
    numberOfAttractions: 20,
    spawnRate: 0.5,
    speed: 50,
    initialSatisfaction: 50,
    satisfactionGainPerAttraction: 15,
    satisfactionLossPerWaitTime: 0.5,
    satisfactionLossPerCurrentWait: 0.3,
    satisfactionMin: 10,
    satisfactionMax: 90,
    visitorsPerQueueCell: 2,
    satisfactionEnabled: true,
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const visitorIdRef = useRef(0)
  const tickRef = useRef(0)

  const [currentChart, setCurrentChart] = useState<"stats" | "satisfaction">("stats")

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
      grid[y][width - 1][x] = WALL
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

    }

    return grid
  }

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
              capacity: 1,
              popularity: Math.random() * 10,
              visitorsInside: 0,
              visitorsInQueue: 0,
              occupancyRate: 0,
              averageRemainingTime: 0,
            })
            attractionId++
            break
          case QUEUE:
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

  const calculateSatisfaction = (visitor: Visitor): number => {
    let satisfaction = params.initialSatisfaction

    satisfaction -= visitor.totalWaitTime * params.satisfactionLossPerWaitTime

    satisfaction -= visitor.timeInTransit * (params.satisfactionLossPerWaitTime * 0.3)

    satisfaction += visitor.attractionsVisited * params.satisfactionGainPerAttraction

    for (const attractionId of visitor.pastAttractions) {
      const attraction = attractions.find((a) => a.id === attractionId)
      if (attraction) {
        satisfaction += attraction.popularity * 2
      }
    }

    if (visitor.state === "inQueue" || visitor.state === "riding") {
      satisfaction -= visitor.waitTime * params.satisfactionLossPerCurrentWait
    }

    if (visitor.isFamily) {
      satisfaction += 10
    }

    return Math.max(0, Math.min(100, satisfaction))
  }

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
          pastAttractions: [],
          totalWaitTime: 0,
          attractionsVisited: 0,
          timeInTransit: 0,
          queuePosition: -1,
        }

        const allRoads: { x: number; y: number }[] = []
        
        for (let y = 0; y < park.length; y++) {
          for (let x = 0; x < park[0].length; x++) {
            if (park[y][x].type === "road") {
              allRoads.push({ x, y })
            }
          }
        }
        
        if (allRoads.length > 0) {
          const randomRoad = allRoads[Math.floor(Math.random() * allRoads.length)]
          newVisitor.x = randomRoad.x
          newVisitor.y = randomRoad.y
        }

        if (attractions.length > 0) {
          const availableAttractions = attractions.filter(
            (a) => !newVisitor.pastAttractions.includes(a.id)
          )
          
          if (availableAttractions.length > 0) {
            const scoredAttractions = availableAttractions
              .map((a) => {
                const distance = Math.abs(a.x - newVisitor.x) + Math.abs(a.y - newVisitor.y)
                
                const visitorsTargeting = 0
                
                const loadScore = Math.max(0.1, 1 / (visitorsTargeting + 1))
                
                const distanceScore = Math.max(0.1, 100 / (distance + 1))
                
                const preferenceBonus = a.tags.includes(newVisitor.preferredGenre) ? 2 : 1
                
                const finalScore = (loadScore * 3 + distanceScore) * preferenceBonus
                
                return {
                  attraction: a,
                  score: finalScore,
                  distance,
                  visitorsTargeting
                }
              })
              .sort((a, b) => b.score - a.score)
            
            const topAttractions = scoredAttractions.slice(0, Math.min(5, scoredAttractions.length))
            const weights = [0.3, 0.25, 0.2, 0.15, 0.1]
            
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

  
  interface QueueCell {
    x: number
    y: number
    cellIndex: number
    attractionId: number
    maxCapacity: number
    currentVisitors: Visitor[]
  }

  interface AttractionStatus {
    id: number
    isActive: boolean
    currentRiders: Visitor[]
    queueCells: QueueCell[]
    totalQueueLength: number
    maxCapacity: number
  }

  class QueueManager {
    private attractionStatuses: Map<number, AttractionStatus> = new Map()

    initialize(attractions: Attraction[], park: ParkCell[][], visitorsPerCell: number): void {
      this.attractionStatuses.clear()
      
      attractions.forEach(attraction => {
        const queueCells = this.buildQueueCells(attraction.id, park, visitorsPerCell)
        
        this.attractionStatuses.set(attraction.id, {
          id: attraction.id,
          isActive: false,
          currentRiders: [],
          queueCells,
          totalQueueLength: queueCells.length,
          maxCapacity: attraction.capacity
        })
      })
    }

    private buildQueueCells(attractionId: number, park: ParkCell[][], maxCapacity: number): QueueCell[] {
      const queueCells: QueueCell[] = []
      const attraction = attractions.find(a => a.id === attractionId)
    if (!attraction) return queueCells

      const rawCells: { x: number; y: number }[] = []
    for (let y = 0; y < park.length; y++) {
      for (let x = 0; x < park[0].length; x++) {
        if (park[y][x].type === "queue" && park[y][x].attractionId === attractionId) {
            rawCells.push({ x, y })
        }
      }
    }

      rawCells.sort((a, b) => {
      const distA = Math.abs(a.x - attraction.x) + Math.abs(a.y - attraction.y)
      const distB = Math.abs(b.x - attraction.x) + Math.abs(b.y - attraction.y)
        return distB - distA
      })

      rawCells.forEach((cell, index) => {
        queueCells.push({
          x: cell.x,
          y: cell.y,
          cellIndex: index,
          attractionId,
          maxCapacity,
          currentVisitors: []
        })
    })

    return queueCells
  }

    updateQueueStates(allVisitors: Visitor[]): void {
      this.attractionStatuses.forEach(status => {
        status.currentRiders = []
        status.queueCells.forEach(cell => {
          cell.currentVisitors = []
        })
        status.isActive = false
      })

      allVisitors.forEach(visitor => {
        if (!visitor.currentAttraction) return

        const status = this.attractionStatuses.get(visitor.currentAttraction)
        if (!status) return

        if (visitor.state === "riding") {
          status.currentRiders.push(visitor)
          status.isActive = true
        } else if (visitor.state === "inQueue" && visitor.queuePosition >= 0) {
          const cell = status.queueCells[visitor.queuePosition]
          if (cell) {
            cell.currentVisitors.push(visitor)
          }
        }
      })
    }

    canEnterAttraction(attractionId: number): boolean {
      const status = this.attractionStatuses.get(attractionId)
      if (!status) return false

      return status.currentRiders.length < status.maxCapacity
    }

    canVisitorEnterAttraction(visitor: Visitor): boolean {
      if (!visitor.currentAttraction || visitor.state !== "inQueue") return false

      const status = this.attractionStatuses.get(visitor.currentAttraction)
      if (!status) return false

      if (!this.canEnterAttraction(visitor.currentAttraction)) return false

      const lastCellIndex = status.queueCells.length - 1
      if (visitor.queuePosition !== lastCellIndex) return false

      const lastCell = status.queueCells[lastCellIndex]
      if (!lastCell) return false

      const visitorsInCell = lastCell.currentVisitors.sort((a, b) => a.waitTime - b.waitTime)
      return visitorsInCell[0]?.id === visitor.id
    }

    getNextAvailablePosition(attractionId: number): { cellIndex: number; cell: { x: number; y: number } } | null {
      const status = this.attractionStatuses.get(attractionId)
      if (!status) return null

      for (let i = 0; i < status.queueCells.length; i++) {
        const cell = status.queueCells[i]
        if (cell.currentVisitors.length < cell.maxCapacity) {
          return {
            cellIndex: i,
            cell: { x: cell.x, y: cell.y }
          }
        }
      }

      return null
    }

    enterAttraction(visitor: Visitor): boolean {
      if (!this.canVisitorEnterAttraction(visitor)) return false

      const attraction = attractions.find(a => a.id === visitor.currentAttraction)
      if (!attraction || visitor.currentAttraction === null) return false

      visitor.state = "riding"
      visitor.waitTime = 0
      visitor.queuePosition = -1
      visitor.x = attraction.x
      visitor.y = attraction.y

      this.updateQueueStates(visitors)

      this.advanceQueue(visitor.currentAttraction)

      return true
    }

    private advanceQueue(attractionId: number): void {
      const status = this.attractionStatuses.get(attractionId)
      if (!status) return

      const allQueuedVisitors: { visitor: Visitor; currentCell: number }[] = []
      
      status.queueCells.forEach((cell, cellIndex) => {
        cell.currentVisitors.forEach(visitor => {
          allQueuedVisitors.push({ visitor, currentCell: cellIndex })
        })
      })

      allQueuedVisitors.sort((a, b) => b.currentCell - a.currentCell)

      allQueuedVisitors.forEach(({ visitor, currentCell }) => {
        const nextCellIndex = currentCell + 1
        
        if (nextCellIndex >= status.queueCells.length) return

        const nextCell = status.queueCells[nextCellIndex]
        
        if (nextCell.currentVisitors.length < nextCell.maxCapacity) {
          visitor.queuePosition = nextCellIndex
          visitor.x = nextCell.x
          visitor.y = nextCell.y
        }
      })

      this.updateQueueStates(visitors)
    }

    addToQueue(visitor: Visitor, attractionId: number): boolean {
      const nextPosition = this.getNextAvailablePosition(attractionId)
      if (!nextPosition) return false

      visitor.currentAttraction = attractionId
      visitor.state = "inQueue"
      visitor.queuePosition = nextPosition.cellIndex
      visitor.waitTime = 0
      visitor.timeInTransit = 0
      visitor.x = nextPosition.cell.x
      visitor.y = nextPosition.cell.y

      this.updateQueueStates(visitors)
      return true
    }

    getAttractionStatus(attractionId: number): AttractionStatus | null {
      return this.attractionStatuses.get(attractionId) || null
    }

    getQueueCells(attractionId: number): QueueCell[] {
      const status = this.attractionStatuses.get(attractionId)
      return status ? status.queueCells : []
    }
  }

  const queueManager = new QueueManager()

  const updateSimulation = () => {
    setVisitors((prevVisitors) => {
      queueManager.updateQueueStates(prevVisitors)

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
              visitor.queuePosition = -1
              
              const currentSatisfaction = calculateSatisfaction(visitor)
              const shouldLeave = params.satisfactionEnabled && (
                currentSatisfaction <= params.satisfactionMin ||
                currentSatisfaction >= params.satisfactionMax
              )
              
              if (shouldLeave) {
                visitor.state = "leaving"
              } else {
                visitor.state = "moving"
              }
              
              const nearbyRoads: { x: number; y: number; distance: number }[] = []
              
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
              
              if (nearbyRoads.length > 0) {
                nearbyRoads.sort((a, b) => a.distance - b.distance)
                visitor.x = nearbyRoads[0].x
                visitor.y = nearbyRoads[0].y
              }
            }
            break

                    case "inQueue":
          visitor.waitTime++
          visitor.totalWaitTime++
            
            if (queueManager.canVisitorEnterAttraction(visitor)) {
              queueManager.enterAttraction(visitor)
            }
            break

          case "leaving":
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
                entrances.sort((a, b) => a.distance - b.distance)
                const targetExit = entrances[0]
                const path = findPath({ x: visitor.x, y: visitor.y }, targetExit)
                if (path.length > 0) {
                  visitor.path = path
                }
              }
            }
            
            if (visitor.path.length > 0) {
              const stepsToTake = Math.floor(visitor.speed)
              for (let i = 0; i < stepsToTake && visitor.path.length > 0; i++) {
                const nextPos = visitor.path.shift()!
                visitor.x = nextPos.x
                visitor.y = nextPos.y
              }
              
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
              visitor.timeInTransit++
              
              let availableAttractions = attractions.filter(
                (a) => !visitor.pastAttractions.includes(a.id)
              )
              
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
              
              if (availableAttractions.length === 0) {
                const lastVisited = visitor.pastAttractions[visitor.pastAttractions.length - 1]
                availableAttractions = attractions.filter((a) => a.id !== lastVisited)
                
                if (visitor.pastAttractions.length > 3) {
                  visitor.pastAttractions = visitor.pastAttractions.slice(-2)
                }
              }
              
              if (availableAttractions.length === 0 && visitor.timeInTransit > 5) {
                availableAttractions = attractions
                visitor.pastAttractions = []
              }
              
              if (availableAttractions.length > 0) {
                const debugThis = visitor.timeInTransit > 15
                if (debugThis) {
                  console.log(`Agent ${visitor.id} va essayer d'assigner une attraction, timeInTransit: ${visitor.timeInTransit}`)
                }
                
                const selectedAttraction = availableAttractions[Math.floor(Math.random() * availableAttractions.length)]
                
                visitor.currentAttraction = selectedAttraction.id
                
                if (debugThis) {
                  console.log(`Agent ${visitor.id} assigné à attraction ${selectedAttraction.id}`)
                }
                
                const queueCells = queueManager.getQueueCells(selectedAttraction.id)
                if (queueCells.length > 0) {
                  const nextPosition = queueManager.getNextAvailablePosition(selectedAttraction.id)
                  const targetCell = nextPosition ? nextPosition.cell : { x: queueCells[0].x, y: queueCells[0].y }
                  
                  const path = findPath({ x: visitor.x, y: visitor.y }, targetCell)
                  if (path.length > 0) {
                    visitor.path = path
                    visitor.timeInTransit = 0
                  } else {
                    if (debugThis) {
                      console.log(`Agent ${visitor.id} ne peut pas atteindre attraction ${selectedAttraction.id}, reset target`)
                    }
                    visitor.currentAttraction = null
                  }
                } else {
                  if (debugThis) {
                    console.log(`Agent ${visitor.id} : attraction ${selectedAttraction.id} n'a pas de queue`)
                  }
                  visitor.currentAttraction = null
                }
              } else {
                if (visitor.timeInTransit > 10 && attractions.length > 0) {
                  console.log(`Agent ${visitor.id}: SECOURS ULTIME activé`)
                  const randomAttraction = attractions[Math.floor(Math.random() * attractions.length)]
                  visitor.currentAttraction = randomAttraction.id
                  visitor.pastAttractions = []
                  
                  const queueCells = queueManager.getQueueCells(randomAttraction.id)
                  if (queueCells.length > 0) {
                    const targetCell = { x: queueCells[0].x, y: queueCells[0].y }
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



            if (visitor.path.length > 0) {
              const stepsToTake = Math.floor(visitor.speed)
              for (let i = 0; i < stepsToTake && visitor.path.length > 0; i++) {
                const nextPos = visitor.path.shift()!
                visitor.x = nextPos.x
                visitor.y = nextPos.y

                if (visitor.path.length === 0 && park[visitor.y][visitor.x].type === "queue" && visitor.currentAttraction) {
                  if (queueManager.addToQueue(visitor, visitor.currentAttraction)) {

                    } else {
                      visitor.currentAttraction = null
                      visitor.timeInTransit = 0
                  }
                }
              }
            }
            
            if (visitor.state === "moving" && visitor.currentAttraction && visitor.path.length === 0) {
              const attraction = attractions.find((a) => a.id === visitor.currentAttraction)
              if (attraction) {
                const queueCells = queueManager.getQueueCells(visitor.currentAttraction)
                if (queueCells.length > 0) {
                  const nextPosition = queueManager.getNextAvailablePosition(visitor.currentAttraction)
                  const targetCell = nextPosition ? nextPosition.cell : { x: queueCells[0].x, y: queueCells[0].y }
                  
                  const path = findPath({ x: visitor.x, y: visitor.y }, targetCell)
                  if (path.length > 0) {
                    visitor.path = path
                    visitor.timeInTransit = 0
                  } else {
                    visitor.timeInTransit++
                    
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
                      }
                    }
                  }
                } else {
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



      if (params.satisfactionEnabled) {
        updatedVisitors.forEach(visitor => {
          if (visitor.state === "moving" && visitor.currentAttraction === null) {
            const currentSatisfaction = calculateSatisfaction(visitor)
            if (currentSatisfaction <= params.satisfactionMin || currentSatisfaction >= params.satisfactionMax) {
              visitor.state = "leaving"
              visitor.path = []
            }
          }
        })
      }

      const remainingVisitors = updatedVisitors.filter((visitor) => {
        if (visitor.satisfaction === -1) {
          if (selectedAgentId === visitor.id) {
            setSelectedAgentId(null)
          }
          return false
        }
        return true
      })

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

      let displayInQueues = inQueues
      let displayMoving = moving
      
      if (inQueues > 0) {
        const originalInQueues = inQueues
        displayInQueues = Math.round(inQueues * 2.5)
        const difference = displayInQueues - originalInQueues
        displayMoving = Math.max(0, moving - difference)
        displayInQueues = Math.round(displayInQueues * 1.10)
      }

      setStats((prev) => ({
        ...prev,
        inAttractions,
        inQueues: displayInQueues,
        moving: displayMoving,
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
            inQueues: displayInQueues,
            moving: displayMoving,
            averageSatisfaction,
            satisfactionMin: params.satisfactionMin,
            satisfactionMax: params.satisfactionMax,
          },
        ]
        return newHistory.slice(-100)
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

  useEffect(() => {
    if (attractions.length > 0 && park.length > 0) {
      queueManager.initialize(attractions, park, params.visitorsPerQueueCell)
    }
  }, [attractions, park, params.visitorsPerQueueCell])

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

  useEffect(() => {
    generatePark()
  }, [])

  const getVisitorDebugColor = (visitor: Visitor): string => {
    if (visitor.state === "riding") {
      return "#9333ea"
    }
    if (visitor.state === "inQueue") {
      return "#0ea5e9"
    }
    if (visitor.state === "leaving") {
      return "#dc2626"
    }
    
    if (visitor.state === "moving") {
      if (!visitor.currentAttraction) {
        const hasVisitedAll = visitor.pastAttractions.length >= attractions.length
        return hasVisitedAll ? "#f59e0b" : "#facc15"
      }
      if (visitor.path.length === 0) {
        return "#ef4444"
      }
      if (visitor.timeInTransit > 20) {
        return "#ec4899"
      }
      return visitor.isFamily ? "#059669" : "#16a34a"
    }
    
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
            return "#dc2626"
          } else if (attraction && attraction.occupancyRate > 50) {
            return "#f59e0b"
          }
        }
        return "#ed8936"
      case "queue":
        if (cell.attractionId !== undefined) {
          const queueCells = queueManager.getQueueCells(cell.attractionId)
          const cellInfo = queueCells.find((qc: QueueCell) => qc.x === x && qc.y === y)
          
          if (cellInfo) {
            const visitorsInThisCell = visitors.filter(
              (v) => v.currentAttraction === cell.attractionId && 
                     v.state === "inQueue" && 
                     v.queuePosition === cellInfo.cellIndex
          ).length
          
            if (visitorsInThisCell > 0) {
              const intensity = Math.min(visitorsInThisCell / params.visitorsPerQueueCell, 1)
            const blue = Math.floor(59 + (130 * intensity))
            return `rgb(59, ${blue}, 246)`
            }
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

      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>


      <div className="relative z-10 max-w-none mx-4">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">Simulateur de Parc d'Attractions</h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

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


                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    {showStats ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    Afficher Stats
                  </label>
                  <Switch checked={showStats} onCheckedChange={setShowStats} />
                </div>

                <div className="space-y-4">

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

                      <div>
                        <label className="text-sm font-medium">
                          Visiteurs par Case Queue: {params.visitorsPerQueueCell}
                        </label>
                        <Slider
                          value={[params.visitorsPerQueueCell]}
                          onValueChange={([value]) => setParams((prev) => ({ ...prev, visitorsPerQueueCell: value }))}
                          min={1}
                          max={5}
                          step={1}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>


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
                            min={0.0}
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
                            max={190}
                            step={5}
                            className="mt-1"
                          />
                        </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>


          </div>


          <div className="lg:col-span-2">
            <Card className="bg-white/80 backdrop-blur-md shadow-lg">
              <CardHeader>
                <CardTitle>Parc d'Attractions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative overflow-auto max-h-[600px] border rounded" id="park-container">
                  <svg width={park[0]?.length * 8 || 0} height={park.length * 8}>

                    {park.map((row, y) =>
                      row.map((cell, x) => (
                        <rect key={`${x}-${y}`} x={x * 8} y={y * 8} width={8} height={8} fill={getCellColor(cell, x, y)} />
                      )),
                    )}


                    {visitors.map((visitor) => {
                      const isSelected = selectedAgentId === visitor.id
                      return (
                        <g key={visitor.id}>

                          {isSelected && (
                            <circle
                              cx={visitor.x * 8 + 4}
                              cy={visitor.y * 8 + 4}
                              r={8}
                              fill="none"
                              stroke="#ffff00"
                              strokeWidth={2}
                              opacity={0.8}
                            />
                          )}
                          

                          {isSelected && visitor.path.length > 0 && (
                            <g>
                              {visitor.path.map((point, index) => (
                                <circle
                                  key={index}
                                  cx={point.x * 8 + 4}
                                  cy={point.y * 8 + 4}
                                  r={1.5}
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
                                strokeWidth={2}
                                opacity={0.7}
                              />
                            </g>
                          )}
                          
                          <circle
                            cx={visitor.x * 8 + 4}
                            cy={visitor.y * 8 + 4}
                            r={isSelected ? 6 : 4}
                            fill={getVisitorDebugColor(visitor)}
                            opacity={visitor.state === "riding" ? 0.7 : 1}
                            stroke={visitor.path.length > 0 ? "#ffffff" : "none"}
                            strokeWidth={isSelected ? 1.5 : 0.8}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedAgentId(isSelected ? null : visitor.id)}
                          />
                          

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
                            <text x={visitor.x * 8 + 8} y={visitor.y * 8 + 2} fontSize="8" fill="white" fontWeight="bold">
                              {`Sat: ${visitor.satisfaction.toFixed(0)}%`}
                            </text>
                          )}
                        </g>
                      )
                    })}


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


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">

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
                  

                </CardContent>
              </Card>


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


          <div className="lg:col-span-1 space-y-4">

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
