extensions [table]

breed [people person]
breed [attractions attraction]

people-own [
  age
  en-famille
  preferred-genre
  current-attraction
  path
  satisfaction
  is-leaving
  destination
  dans-file?
  temps-attente
  duree-attraction
  vitesse-agent ;; Vitesse individuelle de l'agent
]

attractions-own [
  :; This class represents an attraction in the park and has the following fields
  :;
  :; - wait-time: The wait time per person in ticks (integer)
  :; - tags: The tags of the attraction (list of string)
  :; - capacity: The total capacity of the attraction

  wait-time
  tags
  capacity

  popularite
  visiteurs-dans
  visiteurs-en-queue
  temps-moyen-restant
  taux-occupation
]


patches-own [
  type-patch
  id-attraction
]

globals [
  entree-patches
  exit-patches
  nb-total-entres
  nb-total-sortis
  attraction_tags ;;
  afficher-labels?
  ; probabilite-spawn-groupe
  ; vitesse-arrivee
  ;; vitesse-depart ; Supprimé car la vitesse est maintenant gérée par l'agent
]


to setup
  clear-all

  ;; Set global variables
  set nb-total-entres 0
  set nb-total-sortis 0
  set attraction_tags ["RollerCoaster" "Famille" "Sensation" "Enfant" "Horreur" "Emre (oe c une attraction Emre)"]

  set afficher-labels? false

  set probabilite-spawn-groupe 0.1
  set vitesse-arrivee 5
  ;; set vitesse-depart 5 ; Supprimé

  if not is-number? nb-visiteurs [ set nb-visiteurs 50 ]
  if not is-number? capacite-queue [ set capacite-queue 10 ]
  if not is-number? seed-random [ set seed-random 0 ]
  if not is-number? vitesse [ set vitesse 10 ]
  if not is-number? probabilite-spawn-groupe [ set probabilite-spawn-groupe 0.1 ]
  if not is-number? vitesse-arrivee [ set vitesse-arrivee 5 ]
  ;; if not is-number? vitesse-depart [ set vitesse-depart 5 ] ; Supprimé
  random-seed seed-random
  load-map
  reset-ticks
end

to load-map
  if not file-exists? "park_ascii.txt" [
    user-message "Could not find the map file: park_ascii.txt"
    stop
  ]

  file-open "park_ascii.txt"
  let lines []
  while [not file-at-end?] [
    set lines lput file-read-line lines
  ]
  file-close

  let H length lines
  if H = 0 [ user-message "Map file is empty." stop ]
  let W length (item 0 lines)
  resize-world 0 (W - 1) 0 (H - 1)
  set-patch-size 8
  clear-patches

  let temp-queues []

  let y H - 1
  foreach lines [ line ->
    let x 0
    foreach string-to-chars line [ c ->
      ask patch x y [
        ifelse c = "." [ set type-patch "chemin" set pcolor gray ]
        [ifelse c = "E" [ set type-patch "entree" set pcolor green ]
        [ifelse c = "A" [
            set type-patch "attraction"
            set id-attraction (word "attr-" x "-" y)
            set pcolor gray
            ;; Spawn Attraction type agent
            spawn-attraction x y
          ]
        [ifelse c = "#" [
            set type-patch "queue"
            set pcolor white - 2
            set temp-queues lput self temp-queues
          ]
        [ifelse c = "X" [
            set type-patch "exit"
            set pcolor cyan
          ]
        [
            set type-patch "vide"
            set pcolor black
        ]]]]]
      ]
      set x x + 1
    ]
    set y y - 1
  ]

  foreach temp-queues [ q ->
    ask q [
      let adjacent-attraction one-of neighbors4 with [ type-patch = "attraction" ]
      if adjacent-attraction != nobody [
        set id-attraction [id-attraction] of adjacent-attraction
      ]
    ]
  ]

  set entree-patches patches with [type-patch = "entree"]
  set exit-patches patches with [type-patch = "exit"]
end


to spawn-attraction [x y]
  ask patch x y [
    sprout-attractions 1 [
      set wait-time random 10
      set tags n-of (1 + random 2) attraction_tags
      set capacity 20 + random 30
      set shape "house"
      set color yellow

      set popularite random-float 10.0
      set visiteurs-dans []
      set visiteurs-en-queue 0
      set temps-moyen-restant 0
      set taux-occupation 0
      set shape "house"
      set color red
      set size 1.5
    ]
  ]
end


to spawn-people
  if is-agentset? entree-patches and any? entree-patches [
    if random-float 1.0 < probabilite-spawn-groupe [
      let new-people-count (1 + random floor(vitesse-arrivee))
      repeat new-people-count [
        ask one-of entree-patches [
          sprout-people 1 [
            set age random 60 + 10
            set en-famille one-of [true false]
            set preferred-genre one-of attraction_tags
            set current-attraction nobody
            set path []
            set satisfaction 100
            set is-leaving false
            set color ifelse-value (en-famille) [ blue ] [ red ]
            set destination nobody
            set dans-file? false
            set temps-attente 0
            set duree-attraction 0
            set shape "person"
            set size 1.2
            set nb-total-entres nb-total-entres + 1
            ;; Initialisation de la vitesse de l'agent
            ifelse en-famille [
              set vitesse-agent (1 + random-float 1.0) ;; Vitesse plus lente pour les familles (1.0 à 2.0)
            ] [
              set vitesse-agent (2 + random-float 2.0) ;; Vitesse plus rapide pour les personnes seules (2.0 à 4.0)
            ]
            choose-new-destination
          ]
        ]
      ]
    ]
  ]
end


to choose-new-destination
  let visitor self
  if not is-leaving [
    let preferred-attractions patches with [
     type-patch = "attraction" and
      any? patches with [ type-patch = "queue" and id-attraction = [id-attraction] of myself ] and
      any? attractions-here with [
        member? [preferred-genre] of visitor [tags] of self
      ]
    ]
    let potential-attractions []
    ifelse not any? preferred-attractions [
      set potential-attractions preferred-attractions
    ] [
      set potential-attractions patches with [type-patch = "attraction" and
        any? patches with [ type-patch = "queue" and id-attraction = [id-attraction] of myself ] and
        any? attractions-here with [
          not member? [preferred-genre] of visitor [tags] of self
        ]
      ]
    ]

    if any? potential-attractions [
      let target-attraction one-of potential-attractions
      let potential-queues patches with [
        type-patch = "queue" and
        id-attraction = [id-attraction] of target-attraction and
        count turtles-here < capacite-queue
      ]

      if any? potential-queues [
        set destination one-of potential-queues
        set current-attraction target-attraction
        set duree-attraction random 30 + 10
      ]
    ]
  ]

  if destination = nobody [
    set is-leaving true
    if any? exit-patches [
      set destination one-of exit-patches
    ]
  ]
end

to-report find-path [target-patch]
  if target-patch = nobody or patch-here = target-patch [ report [] ]

  let path-data table:make

  let queue (list patch-here)

  table:put path-data (list pxcor pycor) (list patch-here 0)

  let found-target? false
  let path-patches []

  let walkable-patch-types ["chemin" "entree" "queue" "exit"]

  while [not empty? queue and not found-target?] [
    let current-patch first queue
    set queue but-first queue

    let current-patch-data table:get path-data (list [pxcor] of current-patch [pycor] of current-patch)

    if current-patch = target-patch [
      set found-target? true
      let temp-patch target-patch
      while [temp-patch != patch-here and temp-patch != nobody] [
        if not table:has-key? path-data (list [pxcor] of temp-patch [pycor] of temp-patch) [
          report []
        ]
        set path-patches fput temp-patch path-patches
        set temp-patch item 0 table:get path-data (list [pxcor] of temp-patch [pycor] of temp-patch)
      ]
      report path-patches
    ]

    ask current-patch [
      foreach sort neighbors4 [neighbor-patch ->
        if (member? [type-patch] of neighbor-patch walkable-patch-types and not table:has-key? path-data (list [pxcor] of neighbor-patch [pycor] of neighbor-patch)) [
          let current-distance item 1 current-patch-data
          table:put path-data (list [pxcor] of neighbor-patch [pycor] of neighbor-patch) (list current-patch (current-distance + 1))
          set queue lput neighbor-patch queue
        ]
      ]
    ]
  ]

  report []
end


to avancer-case
  if destination = nobody [ stop ]

  if (empty? path or last path != destination) [
    set path find-path destination
  ]

  if empty? path [
    set destination nobody
    set current-attraction nobody
    stop
  ]

  ;; Utilisation de la vitesse individuelle de l'agent pour le déplacement
  let steps-to-take floor(vitesse-agent)
  if steps-to-take < 1 [ set steps-to-take 1 ]

  repeat steps-to-take [
    if empty? path [ stop ] ;; Arrête si le chemin est vide

    let next-patch item 0 path
    move-to next-patch
    set path but-first path

    if patch-here = destination [
      ifelse [type-patch] of patch-here = "exit" [
        set nb-total-sortis nb-total-sortis + 1
        die
      ] [
        if [type-patch] of patch-here = "queue" [
          set dans-file? true
          set temps-attente 0
          set path [] ;; Efface le chemin une fois arrivé à la file
        ]
      ]
      stop ;; Arrête le repeat si la destination est atteinte
    ]
  ]
end

to go
  spawn-people ;; Ensure there's a chance to spawn new people each tick
  wait (1 / vitesse)
  ask people [
    ifelse not dans-file? [
      if destination = nobody [
        choose-new-destination
      ]
      avancer-case
    ] [
      set temps-attente temps-attente + 1
      if temps-attente >= duree-attraction [
        set satisfaction satisfaction + (random 20 + 10)
        set dans-file? false
        set current-attraction nobody
        set destination nobody
      ]
    ]
    ]

  mettre-a-jour-stats-attractions
  if afficher-labels? [
    afficher-labels-attractions
  ]

  tick
end

to-report nb-dans-attractions
  report count people with [dans-file?]
end

to-report nb-en-parcours
  report count people with [not dans-file?]
end

to-report nb-en-queue
  report count people with [destination != nobody and [type-patch] of destination = "queue" and not dans-file?]
end


to-report string-to-chars [s]
  report map [i -> substring s i (i + 1)] (range (length s))
end

to mettre-a-jour-stats-attractions
  ask attractions [
    let patch-attraction patch-here
    let visiteurs-dans-attraction count people with [current-attraction = patch-attraction and dans-file?]
        set visiteurs-dans visiteurs-dans-attraction

    let attraction-id [id-attraction] of patch-here
    let queues-attraction patches with [type-patch = "queue" and id-attraction = attraction-id]
        set visiteurs-en-queue sum [count people-here] of queues-attraction

        set taux-occupation (visiteurs-dans / capacity) * 100

    if visiteurs-dans > 0 [
      let temps-total 0
      ask people with [current-attraction = patch-attraction and dans-file?] [
        set temps-total temps-total + (duree-attraction - temps-attente)
      ]
      set temps-moyen-restant temps-total / visiteurs-dans
    ]
  ]
end

to afficher-labels-attractions
  ask attractions [
    if afficher-labels? [
      let info-label (word
        "Pop: " (precision popularite 1) "\n"
        "Occ: " visiteurs-dans "/" capacity " (" (precision taux-occupation 0) "%)\n"
        "Queue: " visiteurs-en-queue "\n"
        "Temps: " (precision temps-moyen-restant 1)
      )
      set label info-label
      set label-color white
    ]
  ]

  if not afficher-labels? [
    ask attractions [set label ""]
  ]
end

to toggle-labels
  set afficher-labels? not afficher-labels?
  afficher-labels-attractions
end
@#$#@#$#@
GRAPHICS-WINDOW
195
54
843
447
-1
-1
8.0
1
10
1
1
1
0
1
1
1
0
79
0
47
0
0
1
ticks
30.0

BUTTON
3
10
69
43
setup
setup
NIL
1
T
OBSERVER
NIL
NIL
NIL
NIL
1

BUTTON
73
10
136
43
go
go
T
1
T
OBSERVER
NIL
NIL
NIL
NIL
1

BUTTON
139
10
227
43
labels on/off
toggle-labels
NIL
1
T
OBSERVER
NIL
NIL
NIL
NIL
1

SLIDER
5
117
177
150
nb-visiteurs
nb-visiteurs
1
500
50.0
1
1
NIL
HORIZONTAL

SLIDER
5
182
177
215
seed-random
seed-random
0
99999
12345.0
1
1
NIL
HORIZONTAL

MONITOR
828
54
944
99
NIL
nb-dans-attractions
17
1
11

MONITOR
828
99
933
144
NIL
nb-en-parcours
17
1
11

SLIDER
6
150
178
183
max-attente
max-attente
10
100
10.0
1
1
NIL
HORIZONTAL

MONITOR
827
144
932
189
NIL
nb-total-entres
17
1
11

MONITOR
827
233
933
278
NIL
nb-total-sortis
17
1
11

MONITOR
827
189
932
234
NIL
count people
17
1
11

MONITOR
827
278
932
323
NIL
nb-en-queue
17
1
11

SLIDER
5
49
177
82
vitesse
vitesse
0.1
10
10.0
0.1
1
NIL
HORIZONTAL

SLIDER
5
83
177
116
capacite-queue
capacite-queue
1
10
4.0
1
1
NIL
HORIZONTAL

SLIDER
5
217
177
250
probabilite-spawn-groupe
probabilite-spawn-groupe
0.0
1.0
0.1
0.01
1
NIL
HORIZONTAL

SLIDER
5
252
177
285
vitesse-arrivee
vitesse-arrivee
1
10
5.0
1
1
NIL
HORIZONTAL

SLIDER
5
252
177
285
vitesse-arrivee
vitesse-arrivee
1
10
5.0
1
1
NIL
HORIZONTAL

PLOT
197
443
657
627
People's states
NIL
NIL
0.0
10.0
0.0
10.0
true
true
"" ""
PENS
"dans attractions" 1.0 0 -2674135 true "" "plot nb-dans-attractions"
"en parcours" 1.0 0 -13840069 true "" "plot nb-en-parcours"
"en queue" 1.0 0 -955883 true "" "plot nb-en-queue"
"total" 1.0 0 -7500403 true "" "plot count people"

@#$#@#$#@
## WHAT IS IT?

(a general understanding of what the model is trying to show or explain)

## HOW IT WORKS

(what rules the agents use to create the overall behavior of the model)

## HOW TO USE IT

(how to use the model, including a description of each of the items in the Interface tab)

## THINGS TO NOTICE

(suggested things for the user to notice while running the model)

## THINGS TO TRY

(suggested things for the user to try to do (move sliders, switches, etc.) with the model)

## EXTENDING THE MODEL

(suggested things to add or change in the Code tab to make the model more complicated, detailed, accurate, etc.)

## NETLOGO FEATURES

(interesting or unusual features of NetLogo that the model uses, particularly in the Code tab; or where workarounds were needed for missing features)

## RELATED MODELS

(models in the NetLogo Models Library and elsewhere which are of related interest)

## CREDITS AND REFERENCES

(a reference to the model's URL on the web if it has one, as well as any other necessary credits, citations, and links)
@#$#@#$#@
default
true
0
Polygon -7500403 true true 150 5 40 250 150 205 260 250

airplane
true
0
Polygon -7500403 true true 150 0 135 15 120 60 120 105 15 165 15 195 120 180 135 240 105 270 120 285 150 270 180 285 210 270 165 240 180 180 285 195 285 165 180 105 180 60 165 15

arrow
true
0
Polygon -7500403 true true 150 0 0 150 105 150 105 293 195 293 195 150 300 150

box
false
0
Polygon -7500403 true true 150 285 285 225 285 75 150 135
Polygon -7500403 true true 150 135 15 75 150 15 285 75
Polygon -7500403 true true 15 75 15 225 150 285 150 135
Line -16777216 false 150 285 150 135
Line -16777216 false 150 135 15 75
Line -16777216 false 150 135 285 75

bug
true
0
Circle -7500403 true true 96 182 108
Circle -7500403 true true 110 127 80
Circle -7500403 true true 110 75 80
Line -7500403 true 150 100 80 30
Line -7500403 true 150 100 220 30

butterfly
true
0
Polygon -7500403 true true 150 165 209 199 225 225 225 255 195 270 165 255 150 240
Polygon -7500403 true true 150 165 89 198 75 225 75 255 105 270 135 255 150 240
Polygon -7500403 true true 139 148 100 105 55 90 25 90 10 105 10 135 25 180 40 195 85 194 139 163
Polygon -7500403 true true 162 150 200 105 245 90 275 90 290 105 290 135 275 180 260 195 215 195 162 165
Polygon -16777216 true false 150 255 135 225 120 150 135 120 150 105 165 120 180 150 165 225
Circle -16777216 true false 135 90 30
Line -16777216 false 150 105 195 60
Line -16777216 false 150 105 105 60

car
false
0
Polygon -7500403 true true 300 180 279 164 261 144 240 135 226 132 213 106 203 84 185 63 159 50 135 50 75 60 0 150 0 165 0 225 300 225 300 180
Circle -16777216 true false 180 180 90
Circle -16777216 true false 30 180 90
Polygon -16777216 true false 162 80 132 78 134 135 209 135 194 105 189 96 180 89
Circle -7500403 true true 47 195 58
Circle -7500403 true true 195 195 58

circle
false
0
Circle -7500403 true true 0 0 300

circle 2
false
0
Circle -7500403 true true 0 0 300
Circle -16777216 true false 30 30 240

cow
false
0
Polygon -7500403 true true 200 193 197 249 179 249 177 196 166 187 140 189 93 191 78 179 72 211 49 209 48 181 37 149 25 120 25 89 45 72 103 84 179 75 198 76 252 64 272 81 293 103 285 121 255 121 242 118 224 167
Polygon -7500403 true true 73 210 86 251 62 249 48 208
Polygon -7500403 true true 25 114 16 195 9 204 23 213 25 200 39 123

cylinder
false
0
Circle -7500403 true true 0 0 300

dot
false
0
Circle -7500403 true true 90 90 120

face happy
false
0
Circle -7500403 true true 8 8 285
Circle -16777216 true false 60 75 60
Circle -16777216 true false 180 75 60
Polygon -16777216 true false 150 255 90 239 62 213 47 191 67 179 90 203 109 218 150 225 192 218 210 203 227 181 251 194 236 217 212 240

face neutral
false
0
Circle -7500403 true true 8 7 285
Circle -16777216 true false 60 75 60
Circle -16777216 true false 180 75 60
Rectangle -16777216 true false 60 195 240 225

face sad
false
0
Circle -7500403 true true 8 8 285
Circle -16777216 true false 60 75 60
Circle -16777216 true false 180 75 60
Polygon -16777216 true false 150 168 90 184 62 210 47 232 67 244 90 220 109 205 150 198 192 205 210 220 227 242 251 229 236 206 212 183

fish
false
0
Polygon -1 true false 44 131 21 87 15 86 0 120 15 150 0 180 13 214 20 212 45 166
Polygon -1 true false 135 195 119 235 95 218 76 210 46 204 60 165
Polygon -1 true false 75 45 83 77 71 103 86 114 166 78 135 60
Polygon -7500403 true true 30 136 151 77 226 81 280 119 292 146 292 160 287 170 270 195 195 210 151 212 30 166
Circle -16777216 true false 215 106 30

flag
false
0
Rectangle -7500403 true true 60 15 75 300
Polygon -7500403 true true 90 150 270 90 90 30
Line -7500403 true 75 135 90 135
Line -7500403 true 75 45 90 45

flower
false
0
Polygon -10899396 true false 135 120 165 165 180 210 180 240 150 300 165 300 195 240 195 195 165 135
Circle -7500403 true true 85 132 38
Circle -7500403 true true 130 147 38
Circle -7500403 true true 192 85 38
Circle -7500403 true true 85 40 38
Circle -7500403 true true 177 40 38
Circle -7500403 true true 177 132 38
Circle -7500403 true true 70 85 38
Circle -7500403 true true 130 25 38
Circle -7500403 true true 96 51 108
Circle -16777216 true false 113 68 74
Polygon -10899396 true false 189 233 219 188 249 173 279 188 234 218
Polygon -10899396 true false 180 255 150 210 105 210 75 240 135 240

house
false
0
Rectangle -7500403 true true 45 120 255 285
Rectangle -16777216 true false 120 210 180 285
Polygon -7500403 true true 15 120 150 15 285 120
Line -16777216 false 30 120 270 120

leaf
false
0
Polygon -7500403 true true 150 210 135 195 120 210 60 210 30 195 60 180 60 165 15 135 30 120 15 105 40 104 45 90 60 90 90 105 105 120 120 120 105 60 120 60 135 30 150 15 165 30 180 60 195 60 180 120 195 120 210 105 240 90 255 90 263 104 285 105 270 120 285 135 240 165 240 180 270 195 240 210 180 210 165 195
Polygon -7500403 true true 135 195 135 240 120 255 105 255 105 285 135 285 165 240 165 195

line
true
0
Line -7500403 true 150 0 150 300

line half
true
0
Line -7500403 true 150 0 150 150

pentagon
false
0
Polygon -7500403 true true 150 15 15 120 60 285 240 285 285 120

person
false
0
Circle -7500403 true true 110 5 80
Polygon -7500403 true true 105 90 120 195 90 285 105 300 135 300 150 225 165 300 195 300 210 285 180 195 195 90
Rectangle -7500403 true true 127 79 172 94
Polygon -7500403 true true 195 90 240 150 225 180 165 105
Polygon -7500403 true true 105 90 60 150 75 180 135 105

plant
false
0
Rectangle -7500403 true true 135 90 165 300
Polygon -7500403 true true 135 255 90 210 45 195 75 255 135 285
Polygon -7500403 true true 165 255 210 210 255 195 225 255 165 285
Polygon -7500403 true true 135 180 90 135 45 120 75 180 135 210
Polygon -7500403 true true 165 180 165 210 225 180 255 120 210 135
Polygon -7500403 true true 135 105 90 60 45 45 75 105 135 135
Polygon -7500403 true true 165 105 165 135 225 105 255 45 210 60
Polygon -7500403 true true 135 90 120 45 150 15 180 45 165 90

sheep
false
15
Circle -1 true true 203 65 88
Circle -1 true true 70 65 162
Circle -1 true true 150 105 120
Polygon -7500403 true false 218 120 240 165 255 165 278 120
Circle -7500403 true false 214 72 67
Rectangle -1 true true 164 223 179 298
Polygon -1 true true 45 285 30 285 30 240 15 195 45 210
Circle -1 true true 3 83 150
Rectangle -1 true true 65 221 80 296
Polygon -1 true true 195 285 210 285 210 240 240 210 195 210
Polygon -7500403 true false 276 85 285 105 302 99 294 83
Polygon -7500403 true false 219 85 210 105 193 99 201 83

square
false
0
Rectangle -7500403 true true 30 30 270 270

square 2
false
0
Rectangle -7500403 true true 30 30 270 270
Rectangle -16777216 true false 60 60 240 240

star
false
0
Polygon -7500403 true true 151 1 185 108 298 108 207 175 242 282 151 216 59 282 94 175 3 108 116 108

target
false
0
Circle -7500403 true true 0 0 300
Circle -16777216 true false 30 30 240
Circle -7500403 true true 60 60 180
Circle -16777216 true false 90 90 120
Circle -7500403 true true 120 120 60

tree
false
0
Circle -7500403 true true 118 3 94
Rectangle -6459832 true false 120 195 180 300
Circle -7500403 true true 65 21 108
Circle -7500403 true true 116 41 127
Circle -7500403 true true 45 90 120
Circle -7500403 true true 104 74 152

triangle
false
0
Polygon -7500403 true true 150 30 15 255 285 255

triangle 2
false
0
Polygon -7500403 true true 150 30 15 255 285 255
Polygon -16777216 true false 151 99 225 223 75 224

truck
false
0
Rectangle -7500403 true true 4 45 195 187
Polygon -7500403 true true 296 193 296 150 259 134 244 104 208 104 207 194
Rectangle -1 true false 195 60 195 105
Polygon -16777216 true false 238 112 252 141 219 141 218 112
Circle -16777216 true false 234 174 42
Rectangle -7500403 true true 181 185 214 194
Circle -16777216 true false 144 174 42
Circle -16777216 true false 24 174 42
Circle -7500403 false true 24 174 42
Circle -7500403 false true 144 174 42
Circle -7500403 false true 234 174 42

turtle
true
0
Polygon -10899396 true false 215 204 240 233 246 254 228 266 215 252 193 210
Polygon -10899396 true false 195 90 225 75 245 75 260 89 269 108 261 124 240 105 225 105 210 105
Polygon -10899396 true false 105 90 75 75 55 75 40 89 31 108 39 124 60 105 75 105 90 105
Polygon -10899396 true false 132 85 134 64 107 51 108 17 150 2 192 18 192 52 169 65 172 87
Polygon -10899396 true false 85 204 60 233 54 254 72 266 85 252 107 210
Polygon -7500403 true true 119 75 179 75 209 101 224 135 220 225 175 261 128 261 81 224 74 135 88 99

wheel
false
0
Circle -7500403 true true 3 3 294
Circle -16777216 true false 30 30 240
Line -7500403 true 150 285 150 15
Line -7500403 true 15 150 285 150
Circle -7500403 true true 120 120 60
Line -7500403 true 216 40 79 269
Line -7500403 true 40 84 269 221
Line -7500403 true 40 216 269 79
Line -7500403 true 84 40 221 269

wolf
false
0
Polygon -16777216 true false 253 133 245 131 245 133
Polygon -7500403 true true 2 194 13 197 30 191 38 193 38 205 20 226 20 257 27 265 38 266 40 260 31 253 31 230 60 206 68 198 75 209 66 228 65 243 82 261 84 268 100 267 103 261 77 239 79 231 100 207 98 196 119 201 143 202 160 195 166 210 172 213 173 238 167 251 160 248 154 265 169 264 178 247 186 240 198 260 200 271 217 271 219 262 207 258 195 230 192 198 210 184 227 164 242 144 259 145 284 151 277 141 293 140 299 134 297 127 273 119 270 105
Polygon -7500403 true true -1 195 14 180 36 166 40 153 53 140 82 131 134 133 159 126 188 115 227 108 236 102 238 98 268 86 269 92 281 87 269 103 269 113

x
false
0
Polygon -7500403 true true 270 75 225 30 30 225 75 270
Polygon -7500403 true true 30 75 75 30 270 225 225 270
@#$#@#$#@
NetLogo 6.4.0
@#$#@#$#@
@#$#@#$#@
@#$#@#$#@
@#$#@#$#@
@#$#@#$#@
default
0.0
-0.2 0 0.0 1.0
0.0 1 1.0 0.0
0.2 0 0.0 1.0
link direction
true
0
Line -7500403 true 150 150 90 180
Line -7500403 true 150 150 210 180
@#$#@#$#@
0
@#$#@#$#@
