import java.util.Scanner;
public class gcd_or_hcf {
  public static void main(String[] args) {
    //scanner class declaration
    Scanner sc = new Scanner(System.in);
    //input from the user		
    System.out.print("Enter the first number : ");
    int num1 = sc.nextInt();
    //input from the user
    System.out.print("Enter the second number : ");
    int num2 = sc.nextInt();
    int n = 1;
    System.out.print("HCF of " + num1 + " and " + num2 + " is ");
    if (num1 != num2) {
      while (n != 0) {
        //storing remainder
        n = num1 % num2;
        if (n != 0) {
          num1 = num2;
          num2 = n;
        }
      }
      //result
      System.out.println(num2);
    } else
      System.out.println("Wrong Input");
    //closing scanner class(not compulsory, but good practice)
    sc.close();
  }
}