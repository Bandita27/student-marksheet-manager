
def calculate_gcd(a, b):
    """
    Calculates the Greatest Common Divisor (GCD) using the Euclidean Algorithm.
    The algorithm works on the principle that the GCD of two numbers also 
    divides their difference.
    
    Logic:
    GCD(a, b) = GCD(b, a % b)
    """
    # Work with absolute values to handle negative inputs
    a, b = abs(a), abs(b)
    
    print(f"Step: a={a}, b={b}")
    
    # Base Case
    if b == 0:
        return a
    
    # Recursive Case
    return calculate_gcd(b, a % b)

def main():
    print("--- Euclidean Algorithm GCD Calculator ---")
    try:
        num1 = int(input("Enter first number (e.g., 36): "))
        num2 = int(input("Enter second number (e.g., 60): "))
        
        print(f"\nCalculating GCD of {num1} and {num2}:")
        result = calculate_gcd(num1, num2)
        
        print(f"\nThe Greatest Common Divisor is: {result}")
        
    except ValueError:
        print("Invalid input! Please enter integer numbers.")

if __name__ == "__main__":
    main()
