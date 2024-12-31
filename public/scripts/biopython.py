import sys
from Bio.Seq import Seq

def translate_sequence(user_input):
    # 将用户输入的核苷酸序列转换为Seq对象
    nucleotide_seq = Seq(user_input)
    
    # 转换为氨基酸序列
    amino_acid_seq = nucleotide_seq.translate()
    
    # 打印氨基酸序列
    print(f"AA_Seq: {amino_acid_seq}")

if __name__ == "__main__":
    user_input = sys.argv[1]
    translate_sequence(user_input)
