# SYMUA2025

## Présentation du Projet

SYMUA2025 est une simulation de parc d'attractions développée avec NetLogo. L'objectif principal de ce projet est de modéliser le comportement des visiteurs dans un parc à thème, incluant leurs déplacements, leurs choix d'attractions, la gestion des files d'attente et leur satisfaction générale. La simulation utilise une carte du parc générée de manière procédurale.

## Description des Fichiers

Le projet est structuré autour des fichiers suivants :

*   **`symua.nlogo`**: Il s'agit du fichier principal du modèle NetLogo. Il contient toute la logique de la simulation :
    *   La définition des différents agents (visiteurs, attractions).
    *   Les règles de comportement des visiteurs (choix des attractions, déplacements, files d'attente).
    *   La gestion du temps et des statistiques du parc.
    *   L'interface graphique de la simulation avec ses boutons et moniteurs.

*   **`generate_map.py`**: Ce script Python est responsable de la création aléatoire du plan du parc. Il génère un fichier texte (`park_ascii.txt` ou `theme_park.txt`) qui représente la carte avec ses différents éléments :
    *   Murs et espaces vides.
    *   Entrées du parc.
    *   Chemins et routes.
    *   Emplacements des attractions.
    *   Zones de files d'attente pour les attractions.

*   **`park_ascii.txt`** (ou **`theme_park.txt`**): Ce fichier texte est la représentation de la carte du parc générée par `generate_map.py`. Il est lu par `symua.nlogo` au démarrage de la simulation pour initialiser l'environnement du parc. Les caractères dans ce fichier définissent le type de chaque case (chemin, mur, attraction, etc.).

*   **`experiments/1step.xml`**: Ce fichier XML est une configuration pour BehaviorSpace, un outil de NetLogo permettant de mener des expériences automatisées. Dans ce cas, il est utilisé pour un test simple qui vérifie que le modèle `symua.nlogo` compile correctement et peut exécuter au moins un pas de simulation.

*   **`justfile`**: Ce fichier définit des commandes qui peuvent être exécutées avec l'outil `just`. Il contient notamment une commande `check` qui utilise le fichier `experiments/1step.xml` pour lancer NetLogo en mode "headless" (sans interface graphique) afin de vérifier la compilation et l'exécution basique du modèle.

*   **`flake.nix`** et **`.envrc`**: Ces fichiers sont utilisés par Nix et direnv pour gérer l'environnement de développement du projet.
    *   `flake.nix` définit les dépendances logicielles (comme NetLogo) nécessaires au projet, assurant ainsi un environnement de construction et d'exécution reproductible.
    *   `.envrc` est utilisé par `direnv` pour charger automatiquement l'environnement défini par `flake.nix` lorsque l'on navigue dans le répertoire du projet.

*   **`README.md`**: Ce fichier (celui que vous lisez actuellement) qui contient la présentation du projet et la description de ses composants.

*   **`parc.ipynb`**: Un notebook Jupyter, probablement utilisé pour des analyses exploratoires, des visualisations ou des tests liés à la génération de la carte ou à l'analyse des résultats de simulation (contenu non inspecté en détail).

*   **`.gitignore`**: Fichier standard de Git spécifiant les fichiers et répertoires à ignorer par le système de contrôle de version (par exemple, les fichiers temporaires, les dépendances locales).
