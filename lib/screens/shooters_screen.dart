import 'package:flutter/material.dart';
import 'camera_screen.dart';

class ShootersScreen extends StatefulWidget {
  // 1. Khai báo nhận 6 biến luật từ SetupScreen
  final int vlXaThu;
  final int vlDanBia;
  final int vlTongDan;
  final int vtXaThu;
  final int vtDanBia;
  final int vtVongLoai;
  final int vtChuKyLoai;
  final String loaiBia;

  const ShootersScreen({
    super.key, 
    required this.vlXaThu, 
    required this.vlDanBia, 
    required this.vlTongDan,
    required this.vtXaThu,
    required this.vtDanBia,
    required this.vtVongLoai,
    required this.vtChuKyLoai,
    required this.loaiBia,
  });

  @override
  State<ShootersScreen> createState() => _ShootersScreenState();
}

class _ShootersScreenState extends State<ShootersScreen> {
  final List<TextEditingController> _nameControllers = [];

  @override
  void initState() {
    super.initState();
    // Tạo ô nhập tên dựa vào số lượng xạ thủ Vòng Loại (vlXaThu)
    for (int i = 0; i < widget.vlXaThu; i++) {
      _nameControllers.add(TextEditingController());
    }
  }

  @override
  void dispose() {
    for (var controller in _nameControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF172C19),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'TÊN XẠ THỦ',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(20),
              itemCount: widget.vlXaThu,
              itemBuilder: (context, index) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 15),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _nameControllers[index],
                          style: const TextStyle(fontSize: 16),
                          decoration: InputDecoration(
                            filled: true,
                            fillColor: Colors.white,
                            hintText: 'Tên xạ thủ ${index + 1}',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, color: Colors.red, size: 30),
                        onPressed: () {
                          _nameControllers[index].clear();
                        },
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          Container(
            padding: const EdgeInsets.all(20),
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFF39C12),
                padding: const EdgeInsets.symmetric(vertical: 20),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () {
                List<String> danhSachTen = [];
                for (int i = 0; i < _nameControllers.length; i++) {
                  String ten = _nameControllers[i].text.trim();
                  if (ten.isEmpty) {
                    ten = 'Xạ thủ ${i + 1}';
                  }
                  danhSachTen.add(ten);
                }

                // 2. Chuyền cả 6 biến luật đi tiếp vào CameraScreen
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => CameraScreen(
                      shooterNames: danhSachTen,
                      vlDanBia: widget.vlDanBia,
                      vlTongDan: widget.vlTongDan,
                      vtXaThu: widget.vtXaThu,
                      vtDanBia: widget.vtDanBia,
                      vtVongLoai: widget.vtVongLoai,
                      vtChuKyLoai: widget.vtChuKyLoai,
                      loaiBia: widget.loaiBia,
                    ),
                  ),
                );
              },
              child: const Text(
                'BẮT ĐẦU THI ĐẤU',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}