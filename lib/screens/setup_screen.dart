import 'package:flutter/material.dart';
import 'shooters_screen.dart';

class SetupScreen extends StatefulWidget {
  final String loaiBia;
  const SetupScreen({super.key, required this.loaiBia});

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  // Controllers cho Vòng Loại
  final TextEditingController _vlXaThuController = TextEditingController();
  final TextEditingController _vlPhatBanBiaController = TextEditingController();
  final TextEditingController _vlTongPhatBanController = TextEditingController();

  // Controllers cho Vòng Trong
  final TextEditingController _vtXaThuController = TextEditingController();
  final TextEditingController _vtPhatBanBiaController = TextEditingController();
  final TextEditingController _vtVongLoaiController = TextEditingController();
  final TextEditingController _vtChuKyLoaiController = TextEditingController();

  @override
  void dispose() {
    _vlXaThuController.dispose();
    _vlPhatBanBiaController.dispose();
    _vlTongPhatBanController.dispose();
    _vtXaThuController.dispose();
    _vtPhatBanBiaController.dispose();
    _vtVongLoaiController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF172C19), // Nền xanh rêu
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'SAIGON SNIPER - LUẬT GIẢI ĐẤU',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // --- VÒNG LOẠI ---
            const Text(
              'VÒNG LOẠI:',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFFD68910)), // Màu cam vàng
            ),
            const SizedBox(height: 15),
            _buildInputRow('Số lượng xạ thủ:', _vlXaThuController),
            _buildInputRow('Số phát bắn cho từng bia:', _vlPhatBanBiaController),
            _buildInputRow('Tổng số phát bắn cho\ntừng xạ thủ:', _vlTongPhatBanController),
            
            const SizedBox(height: 30),

            // --- VÒNG TRONG ---
            const Text(
              'VÒNG TRONG:',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFFD68910)),
            ),
            const SizedBox(height: 15),
            _buildInputRow('Số lượng xạ thủ:', _vtXaThuController),
            _buildInputRow('Số phát bắn cho từng bia:', _vtPhatBanBiaController),
            _buildInputRow('Số phát bắn trước khi loại:', _vtVongLoaiController),
            _buildInputRow('Sau bao nhiêu viên loại tiếp:', _vtChuKyLoaiController),

            const SizedBox(height: 40),

            // --- NÚT XÁC NHẬN ---
            SizedBox(
              width: double.infinity,
              height: 55,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFD68910),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: () {
                  // Lấy toàn bộ 6 dữ liệu từ các ô nhập, nếu ô nào để trống thì gán giá trị mặc định
                  int vlXaThu = int.tryParse(_vlXaThuController.text) ?? 5; 
                  int vlDanBia = int.tryParse(_vlPhatBanBiaController.text) ?? 5;
                  int vlTongDan = int.tryParse(_vlTongPhatBanController.text) ?? 20;
                  
                  int vtXaThu = int.tryParse(_vtXaThuController.text) ?? 0;
                  int vtDanBia = int.tryParse(_vtPhatBanBiaController.text) ?? 0;
                  int vtVongLoai = int.tryParse(_vtVongLoaiController.text) ?? 0;
                  int vtChuKyLoai = int.tryParse(_vtChuKyLoaiController.text) ?? 2; // Mặc định là 2

                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => ShootersScreen(
                        loaiBia: widget.loaiBia,
                        vlXaThu: vlXaThu,
                        vlDanBia: vlDanBia,
                        vlTongDan: vlTongDan,
                        vtXaThu: vtXaThu,
                        vtDanBia: vtDanBia,
                        vtVongLoai: vtVongLoai,
                        vtChuKyLoai: vtChuKyLoai,
                      ),
                    ),
                  );
                },
                child: const Text(
                  'Xác nhận',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  // Hàm tạo từng dòng có chữ bên trái, ô nhập nhỏ bên phải
  Widget _buildInputRow(String label, TextEditingController controller) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: const TextStyle(fontSize: 16, color: Colors.white, height: 1.3),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 1,
            child: SizedBox(
              height: 45,
              child: TextField(
                controller: controller,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 16),
                decoration: InputDecoration(
                  hintText: '0',
                  hintStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
                  contentPadding: EdgeInsets.zero, // Ép chữ ra giữa ô
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: Colors.white.withOpacity(0.3), width: 1),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Color(0xFFD68910), width: 1.5),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}