check netlogo="netlogo":
    # checks the code compiles
    timeout 10 {{netlogo}} --headless  --model $(pwd)/symua.nlogo --setup-file $(pwd)/test.xml --table -
