import random
import time

# operations
ops = ["+", "-", "×", "÷"]

# time duration
max_time = input("time [s]: ")
max_time = time.time() + int(max_time)

# addition domain
add_low1 = 2
add_high1 = 100
add_low2 = 2
add_high2 = 100

# multiplication domain
multiply_low1 = 2
multiply_high1 = 12
multiply_low2 = 2
multiply_high2 = 100

# initialize score
score = 0

while time.time() < max_time:
    # randomize operations
    op = random.choice(ops)

    if op == "+":
        # randomize numbers
        num1 = random.randint(add_low1, add_high1)
        num2 = random.randint(add_low2, add_high2)

        # addition solution
        soln = num1 + num2
    
    elif op == "-":
        # randomize numbers
        a = random.randint(add_low1, add_high1)
        b = random.randint(add_low2, add_high2)

        # num1 > num2
        num1 = max(a, b)
        num2 = min(a, b)

        # subtraction solution
        soln = num1 - num2
    
    elif op == "×":
        # randomize numbers
        num1 = random.randint(multiply_low1, multiply_high1)
        num2 = random.randint(multiply_low2, multiply_high2)

        # multiplication solution
        soln = num1 * num2
    
    elif op == "÷": 
        # randomize numbers
        num2 = random.randint(multiply_low2, multiply_high2)
        quotient = random.randint(multiply_low1, multiply_high1)
        num1 = num2 * quotient

        # division solution
        soln = num1 // num2
    
    # check answer against solution
    answer = input(f"{num1} {op} {num2} = ")
    while answer != str(soln):
        answer = input(f"{num1} {op} {num2} = ")
    
    # update score
    score += 1
    
print(f"score: {score}")
